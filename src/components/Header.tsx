import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { ArrowUpRight, Menu, X } from "lucide-react";
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link
      to="/"
      className={`brand ${light ? "brand-light" : ""}`}
      aria-label="PuzzleTogether home"
    >
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path
          d="M3 3h10v4a3 3 0 1 0 6 0V3h10v10h-4a3 3 0 1 0 0 6h4v10H19v-4a3 3 0 1 0-6 0v4H3V19h4a3 3 0 1 0 0-6H3Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
      <span>
        PuzzleTogether<span className="brand-dot">®</span>
      </span>
    </Link>
  );
}
export default function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand />
        <nav
          className={open ? "navigation is-open" : "navigation"}
          aria-label="Main navigation"
        >
          <NavLink to="/collection" onClick={() => setOpen(false)}>
            The collection
          </NavLink>
          <Link
            to="/#how-it-works"
            onClick={() => {
              setOpen(false);
              setTimeout(
                () =>
                  document
                    .getElementById("how-it-works")
                    ?.scrollIntoView({ behavior: "smooth" }),
                40,
              );
            }}
          >
            How it works
          </Link>
          <NavLink to="/solo" onClick={() => setOpen(false)}>
            A moment for yourself <ArrowUpRight size={12} />
          </NavLink>
        </nav>
        <Link to="/join" className="header-join">
          Join a room <ArrowUpRight size={15} />
        </Link>
        <button
          className="menu-toggle icon-button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
    </header>
  );
}
