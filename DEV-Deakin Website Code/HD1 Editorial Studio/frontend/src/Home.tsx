import { Link } from "react-router-dom";
import { Newsletter } from "./components.tsx";
import { useAuth } from "./auth.tsx";
const projects = [
  {
    title: "Personal website",
    text: "A responsive profile, project portfolio and image gallery.",
    image: "project-portfolio.jpg",
  },
  {
    title: "Welcome email",
    text: "An Express endpoint that sends a welcome message through an email API.",
    image: "project-newsletter.jpg",
  },
  {
    title: "DEV@Deakin",
    text: "React forms, accounts and an editorial review workflow.",
    image: "project-api.jpg",
  },
];
const articles = [
  {
    title: "Readable forms",
    text: "Start with clear labels and useful validation feedback.",
    image: "gallery-code.jpg",
    author: "Demo Writer",
    rating: "4.8",
  },
  {
    title: "A request from end to end",
    text: "Connect an interface to a server without losing the user’s input.",
    image: "gallery-team.jpg",
    author: "Demo Contributor",
    rating: "4.7",
  },
  {
    title: "Learning together",
    text: "Turn questions into explanations the next reader can use.",
    image: "gallery-study.jpg",
    author: "Demo Reviewer",
    rating: "4.9",
  },
];
const tutorials = [
  {
    title: "Build a clear registration form",
    text: "Use clear labels, matching passwords and useful validation feedback.",
    image: "gallery-code.jpg",
    author: "Demo Writer",
    rating: "4.8",
    to: "/signup",
  },
  {
    title: "Connect React and Express",
    text: "Send a validated form to the API and handle its response.",
    image: "gallery-team.jpg",
    author: "Demo Contributor",
    rating: "4.7",
    to: "/post",
  },
  {
    title: "Review an article with useful feedback",
    text: "Use the studio to revise a draft before it is published.",
    image: "gallery-study.jpg",
    author: "Demo Reviewer",
    rating: "4.9",
    to: "/studio",
  },
];

// Preview metadata demonstrates the card layout; it is not a community rating or endorsement.
function ExampleMetadata({
  author,
  rating,
}: {
  author: string;
  rating: string;
}) {
  return (
    <div className="card-meta">
      <span>Example author: {author}</span>
      <span
        className="card-rating"
        aria-label={`Example rating: ${rating} out of 5`}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            fill="currentColor"
            d="m12 2.5 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5L2.6 9.3l6.5-.9L12 2.5Z"
          />
        </svg>
        Example rating: {rating}/5
      </span>
    </div>
  );
}

export function CataloguePage({ kind }: { kind: "articles" | "tutorials" }) {
  const items = kind === "articles" ? articles : tutorials;
  return (
    <main className="page">
      <p className="eyebrow">Example editorial catalogue</p>
      <h1>{kind === "articles" ? "Articles" : "Tutorials"}</h1>
      <p>
        These preview topics, authors and ratings are sample data, separate from
        published community posts.
      </p>
      <div className="cards">
        {items.map((item) => (
          <article className="card" key={item.title}>
            <img src={`/assets/${item.image}`} alt="" />
            <div>
              <h2>{item.title}</h2>
              <p>{item.text}</p>
              <ExampleMetadata author={item.author} rating={item.rating} />
            </div>
          </article>
        ))}
      </div>
      <nav className="actions" aria-label="Catalogue">
        <Link to="/">Back to Home</Link>
        <Link to="/browse">Browse published community posts</Link>
      </nav>
    </main>
  );
}

export default function Home() {
  const { user } = useAuth();
  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">The DEV@Deakin community</p>
          <h1>
            Good ideas deserve
            <br />a second pair of eyes.
          </h1>
          <p>
            Ask a question. Share an article. Turn feedback into a better
            explanation.
          </p>
          <div className="actions">
            <Link className="button" to="/browse">
              Explore posts
            </Link>
            <Link className="button secondary" to="/post">
              Start writing
            </Link>
          </div>
        </div>
        <img src="/assets/gallery-code.jpg" alt="Programming workspace" />
        <div className="hero-hover">Hey, I’m Romil</div>
      </section>
      {user && (
        <p className="welcome">
          Signed in as {user.firstName} {user.lastName} ·{" "}
          <strong>{user.plan} plan</strong>
        </p>
      )}
      <section id="about" className="section">
        <p className="eyebrow">About</p>
        <h2>Romil Bijarnia</h2>
        <p>
          Software engineering student at Deakin University. This portfolio
          brings together the DEV@Deakin coursework.
        </p>
        <nav className="inline-links">
          <a href="#work">Work</a>
          <a href="#contact">Contact</a>
        </nav>
      </section>
      <section id="work" className="section">
        <div className="section-head">
          <h2>Portfolio</h2>
          <span>DEV@Deakin project work</span>
        </div>
        <div className="cards">
          {projects.map((p) => (
            <article className="card" key={p.title}>
              <img src={`/assets/${p.image}`} alt="" />
              <div>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="section" aria-labelledby="featured-articles">
        <div className="section-head">
          <h2 id="featured-articles">Featured articles</h2>
          <Link to="/articles">See all articles</Link>
        </div>
        <p className="muted">
          Example editorial cards with sample authors and ratings. Published
          community submissions appear in Browse posts.
        </p>
        <div className="cards">
          {articles.map((p) => (
            <article className="card" key={p.title}>
              <img src={`/assets/${p.image}`} alt="" />
              <div>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
                <ExampleMetadata author={p.author} rating={p.rating} />
                <Link to="/browse?type=article">Browse related posts</Link>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section
        id="tutorials"
        className="section"
        aria-labelledby="featured-tutorials"
      >
        <div className="section-head">
          <h2 id="featured-tutorials">Featured tutorials</h2>
          <Link to="/tutorials">See all tutorials</Link>
        </div>
        <p className="muted">
          Example tutorials, authors and ratings illustrating the project’s
          features.
        </p>
        <div className="cards">
          {tutorials.map((t) => (
            <article className="card" key={t.title}>
              <img src={`/assets/${t.image}`} alt="" />
              <div>
                <h3>{t.title}</h3>
                <p>{t.text}</p>
                <ExampleMetadata author={t.author} rating={t.rating} />
                <Link to={t.to}>Explore the feature</Link>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="section">
        <h2>Gallery</h2>
        <div className="gallery">
          {[...projects, ...articles].map((p) => (
            <img key={p.image} src={`/assets/${p.image}`} alt={p.title} />
          ))}
        </div>
      </section>
      <Newsletter />
      <section className="section" id="contact">
        <h2>Contact</h2>
        <p>Use the community post form to share a question or an article.</p>
        <Link to="/post">Write a post</Link>
      </section>
    </main>
  );
}
