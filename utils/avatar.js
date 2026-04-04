// utils/avatar.js
const BG_COLORS = [
  '#FF6B6B', '#FF9F43', '#FECA57', '#48DBFB',
  '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3',
  '#1DD1A1', '#C8D6E5',
]

function getAvatarInfo(nickName) {
  if (!nickName) return {
    char: '?',
    bg: '#C8D6E5'
  }

  // 取第一个字符
  const char = nickName.charAt(0).toUpperCase()

  // 根据名字哈希固定取一个颜色，同一个人颜色永远一致
  let hash = 0
  for (let i = 0; i < nickName.length; i++) {
    hash = nickName.charCodeAt(i) + ((hash << 5) - hash)
  }
  const bg = BG_COLORS[Math.abs(hash) % BG_COLORS.length]

  return {
    char,
    bg
  }
}

module.exports = {
  getAvatarInfo
}