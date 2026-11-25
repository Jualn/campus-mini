package cn.jualn.miniapp.module.admin.auth.rbac;

import cn.jualn.miniapp.module.person.bo.PersonBO;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

/** Runs the EXISTING compiled Backend integration fixture, never an imitation HTTP server.
 * The launcher supplies new dedicated loopback MySQL/Redis and a temporary working directory.
 * Synthetic authority preparation follows that fixture; it cannot authorize real people.
 */
public class PointsMiniConsumerBackend {
    public static void main(String[] args) throws Exception {
        if(args.length != 3) throw new IllegalArgumentException("Mini root, Node executable and evidence file required");
        var fixture = new PointsIntegrationHttpTest();
        int exit = 0;
        try {
            fixture.start();
            var target = new PersonBO.Target("PERSON",Long.toString(PointsIntegrationHttpTest.USER),null);
            var maintenance = List.of(PersonBO.Action.READ,PersonBO.Action.MAINTAIN);
            fixture.control(PersonBO.Domain.IDENTITY, maintenance, target);
            fixture.scope(PointsIntegrationHttpTest.STEWARD,target,PersonBO.Domain.IDENTITY,maintenance);
            var identity = fixture.call("GET",PointsIntegrationHttpTest.PEOPLE+PointsIntegrationHttpTest.USER+"/identity",fixture.steward,null,Map.of());
            fixture.checked(200,identity);
            fixture.write(200,"POST",PointsIntegrationHttpTest.PEOPLE+PointsIntegrationHttpTest.USER+"/identity-changes",fixture.steward,
                    Map.of("kind","RECORD","stageId","PARTY_ACTIVIST","reason","Mini consumer synthetic identity preparation","verificationReference","isolated-mini-consumer"),
                    Map.of("If-Match",identity.headers().firstValue("ETag").orElseThrow()));
            fixture.control(PersonBO.Domain.ORGANIZATION,maintenance,target);
            fixture.scope(PointsIntegrationHttpTest.STEWARD,target,PersonBO.Domain.ORGANIZATION,maintenance);
            var memberships=fixture.call("GET",PointsIntegrationHttpTest.PEOPLE+PointsIntegrationHttpTest.USER+"/memberships",fixture.steward,null,Map.of());
            fixture.checked(200,memberships);
            fixture.write(200,"PUT",PointsIntegrationHttpTest.PEOPLE+PointsIntegrationHttpTest.USER+"/memberships",fixture.steward,
                    Map.of("verification","VERIFIED","memberships",List.of(),"reason","Synthetic verified complete empty membership set","verificationReference","isolated-mini-consumer"),
                    Map.of("If-Match",memberships.headers().firstValue("ETag").orElseThrow()));
            var review = List.of(PersonBO.Action.READ,PersonBO.Action.REVIEW);
            fixture.control(PersonBO.Domain.POINTS,review,target);
            fixture.scope(PointsIntegrationHttpTest.REVIEWER,target,PersonBO.Domain.POINTS,review);
            var builder = new ProcessBuilder(args[1],Path.of(args[0],"scripts","test-points-backend-http.mjs").toString(),args[2]);
            builder.directory(Path.of(args[0]).toFile());
            // Short-lived process environment only; never write bearer credentials to evidence/logs.
            builder.environment().put("MINI_POINTS_TEST_BASE",fixture.base);
            builder.environment().put("MINI_POINTS_TEST_TOKEN",fixture.user);
            builder.environment().put("MINI_POINTS_TEST_USER",Long.toString(PointsIntegrationHttpTest.USER));
            builder.environment().put("MINI_POINTS_TEST_OUTSIDER_TOKEN",fixture.outsider);
            builder.environment().put("MINI_POINTS_TEST_OUTSIDER",Long.toString(PointsIntegrationHttpTest.OUTSIDER));
            builder.environment().put("MINI_POINTS_TEST_REVIEW_TOKEN",fixture.reviewer);
            var process = builder.inheritIO().start();
            if(!process.waitFor(90,java.util.concurrent.TimeUnit.SECONDS)) { process.destroyForcibly(); throw new IllegalStateException("Mini consumer timeout"); }
            if(process.exitValue()!=0) throw new IllegalStateException("Mini consumer HTTP assertions failed");
        } catch(Throwable failure) {
            failure.printStackTrace();
            exit=1;
        } finally {
            try { fixture.stop(); } catch(Throwable failure) { failure.printStackTrace(); exit=1; }
            // The test fixture's shared clients keep JVM threads alive outside Surefire.
            // This dedicated launcher owns the whole JVM; finish after closing Spring.
            System.exit(exit);
        }
    }
}
