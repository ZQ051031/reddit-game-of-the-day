type Props = { onClose: () => void };

export const Help = ({ onClose }: Props) => (
  <div className="modal-backdrop" onClick={onClose}>
    <div
      className="modal"
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="How to play"
    >
      <h2>How to play</h2>
      <ul className="rules">
        <li>
          <span className="rule-icon puck-icon" />
          <div>
            <b>Swipe or use arrow keys.</b> Your puck slides on the ice until it
            hits a rock or the wall.
          </div>
        </li>
        <li>
          <span className="rule-icon token-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3 3 13h5.5v8h7v-8H21z" />
            </svg>
          </span>
          <div>
            <b>Grab every upvote.</b> Sliding over one collects it — you don’t
            need to stop on it.
          </div>
        </li>
        <li>
          <span className="rule-icon moss-icon" />
          <div>
            <b>Moss stops you.</b> Sliding onto a moss tile halts the puck right
            there.
          </div>
        </li>
        <li>
          <span className="rule-icon par-icon">★</span>
          <div>
            <b>Beat par.</b> Every swipe counts, even ones you undo. Match par
            for 3 stars on each of the 3 daily stages.
          </div>
        </li>
      </ul>
      <p className="muted small">
        Same puzzle for everyone, new one every day at 00:00 UTC. Keep your
        streak alive!
      </p>
      <button className="btn btn-primary btn-block" onClick={onClose}>
        Let’s slide
      </button>
    </div>
  </div>
);
