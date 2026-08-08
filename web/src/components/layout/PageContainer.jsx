export function PageContainer({ children, fullBleed = false }) {
  return (
    <main id="main-content" className={`app-main ${fullBleed ? "app-main--full-bleed" : ""}`.trim()} tabIndex="-1">
      {children}
    </main>
  );
}
