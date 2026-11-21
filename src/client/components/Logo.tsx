export const Logo = ({ small = false }: { small?: boolean }) => (
  <div className={`logo${small ? ' logo-small' : ''}`}>
    <span className="logo-puck" aria-hidden="true">
      <span className="eye l" />
      <span className="eye r" />
    </span>
    <span className="logo-word">
      UP<span>SLIDE</span>
    </span>
  </div>
);
