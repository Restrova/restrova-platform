export function BrandMark({ size = 48, className = "", title, monochrome = false }) {
  return (
    <svg
      className={`restrova-brand-mark ${className}`.trim()}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 80 80"
      width={size}
      height={size}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path
        d="M21 9h29c17 0 26 8 26 22 0 10-5 17-15 20l17 20H57L40 50H28V35h22c6 0 9-2 9-6s-3-6-9-6H21Z"
        fill={monochrome ? "currentColor" : "#ff6a00"}
      />
      <path d="M7 64c7-13 24-21 48-22-20-3-37 0-48 8Z" fill={monochrome ? "currentColor" : "#ff4d00"} />
      <path d="M13 37h37c-2-10-8-16-18-16s-16 6-19 16Z" fill={monochrome ? "currentColor" : "#ff6a00"} />
      <path d="M10 40h44" stroke={monochrome ? "currentColor" : "#ff6a00"} strokeWidth="4" strokeLinecap="round" />
      <circle cx="32" cy="18" r="3" fill={monochrome ? "currentColor" : "#ff6a00"} />
    </svg>
  );
}
export function BrandPixels({ className = "" }) {
  return (
    <span className={`brand-pixels ${className}`.trim()} aria-hidden="true">
      <span className="brand-pixel" />
      <span className="brand-pixel" />
      <span className="brand-pixel" />
    </span>
  );
}
