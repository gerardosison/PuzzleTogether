import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Brand } from "./Header";
export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <Brand />
        <p>
          A little patience. A little company.
          <br />
          Something worth putting together.
        </p>
        <Link className="text-link" to="/collection">
          Find your next puzzle <ArrowUpRight size={13} />
        </Link>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} PuzzleTogether</span>
        <span>Made for the joy of figuring it out.</span>
        <Link to="/about">
          About this little place <ArrowUpRight size={10} />
        </Link>
      </div>
    </footer>
  );
}
