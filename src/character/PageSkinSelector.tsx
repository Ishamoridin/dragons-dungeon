import { PAGE_SKINS, type PageSkin } from './PageSkin'

export default function PageSkinSelector({
  value,
  onChange,
}: {
  value: PageSkin
  onChange: (skin: PageSkin) => void
}) {
  return (
    <label className="page-skin-control">
      <span>Skin</span>
      <select
        aria-label="Page skin"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value as PageSkin)}
      >
        {PAGE_SKINS.map((skin) => (
          <option key={skin.id} value={skin.id}>{skin.label}</option>
        ))}
      </select>
    </label>
  )
}
