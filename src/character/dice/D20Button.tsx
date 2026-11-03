// The big dice button: a d20 silhouette showing a 20, sized to anchor the middle of the Player and DM screens.
export default function D20Button({ onClick, label = 'Roll dice' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="d20-button" onClick={onClick} aria-label={label} title={label}>
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        {/* Icosahedron outline: a hexagon with the front face and its spokes. */}
        <polygon className="d20-outline" points="50,3 90,26 90,74 50,97 10,74 10,26" />
        <polygon className="d20-face" points="50,22 76,67 24,67" />
        <path className="d20-edges" d="M50,3 L50,22 M90,26 L76,67 M10,26 L24,67 M90,74 L76,67 M10,74 L24,67 M50,97 L76,67 M50,97 L24,67 M50,22 L90,26 M50,22 L10,26" />
        <text className="d20-number" x="50" y="56" textAnchor="middle" dominantBaseline="middle">20</text>
      </svg>
      <span className="d20-button-caption">{label}</span>
    </button>
  )
}
