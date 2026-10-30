const metadata = new Set(['Id', 'OwnerId', 'OwnerName', 'DMId', 'DMName', 'CreatedAt', 'UpdatedAt', 'Version', '_id'])
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

export function mergeCopies(base, local, server) {
  const merged = structuredClone(server)
  const differences = []
  function visit(baseValue, localValue, serverValue, path, localExists, serverExists) {
    if (equal(localValue, serverValue) && localExists === serverExists) return
    if (base && equal(localValue, baseValue) && localExists === hasPath(base, path)) return
    if (base && equal(serverValue, baseValue) && serverExists === hasPath(base, path)) {
      setPath(merged, path, localValue, localExists)
      return
    }
    if (object(localValue) && object(serverValue)) {
      for (const key of new Set([...Object.keys(localValue), ...Object.keys(serverValue)])) {
        visit(baseValue?.[key], localValue[key], serverValue[key], [...path, key], Object.hasOwn(localValue, key), Object.hasOwn(serverValue, key))
      }
      return
    }
    differences.push({ Path: path, Local: localValue, Server: serverValue, Base: baseValue, LocalExists: localExists, ServerExists: serverExists })
  }
  for (const key of new Set([...Object.keys(local), ...Object.keys(server)])) {
    if (!metadata.has(key)) visit(base?.[key], local[key], server[key], [key], Object.hasOwn(local, key), Object.hasOwn(server, key))
  }
  return { merged, differences }
}

function hasPath(value, path) {
  return path.every((key) => {
    if (!value || !Object.hasOwn(value, key)) return false
    value = value[key]
    return true
  })
}

function setPath(target, path, value, exists) {
  let parent = target
  for (const key of path.slice(0, -1)) {
    if (!object(parent[key])) parent[key] = {}
    parent = parent[key]
  }
  const key = path.at(-1)
  if (exists) parent[key] = structuredClone(value)
  else delete parent[key]
}

export function resolveCopies(base, local, server, choices) {
  const { merged, differences } = mergeCopies(base, local, server)
  if (differences.length !== choices.length || choices.some((choice) => !['local', 'server'].includes(choice))) throw new Error('Choose a copy for every differing field.')
  differences.forEach((difference, index) => {
    if (choices[index] === 'local') setPath(merged, difference.Path, difference.Local, difference.LocalExists)
  })
  return merged
}