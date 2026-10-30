export function suggestStrongPassword(): string {
  const groups = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%&*-_+=?']
  const alphabet = groups.join('')
  const randomIndex = (maximum: number) => {
    const bytes = new Uint32Array(1)
    const limit = Math.floor(2 ** 32 / maximum) * maximum
    do { crypto.getRandomValues(bytes) } while (bytes[0] >= limit)
    return bytes[0] % maximum
  }
  const characters = groups.map((group) => group[randomIndex(group.length)])
  while (characters.length < 24) characters.push(alphabet[randomIndex(alphabet.length)])
  for (let index = characters.length - 1; index > 0; index--) {
    const swap = randomIndex(index + 1)
    ;[characters[index], characters[swap]] = [characters[swap], characters[index]]
  }
  return characters.join('')
}