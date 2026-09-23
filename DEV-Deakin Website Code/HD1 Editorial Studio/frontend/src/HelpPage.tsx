import { Link } from "react-router-dom";

// Project-specific usage and data notes, not a claim to state university policy.
export default function HelpPage() {
  return (
    <main className="page narrow help-page">
      <p className="eyebrow">DEV@Deakin</p>
      <h1>Help and project information</h1>
      <section aria-labelledby="getting-started">
        <h2 id="getting-started" tabIndex={-1}>
          Getting started
        </h2>
        <p>
          Explore the example <Link to="/articles">articles</Link> and{" "}
          <Link to="/tutorials">tutorials</Link>, or read published{" "}
          <Link to="/browse">community posts</Link>. Create an account and sign
          in to save a Question or Article. A saved draft stays in{" "}
          <Link to="/studio">My studio</Link> until you submit it for review.
        </p>
        <p>
          If a save cannot be confirmed, check My studio before retrying so you
          do not create a duplicate.
        </p>
      </section>
      <section aria-labelledby="faqs">
        <h2 id="faqs" tabIndex={-1}>
          Frequently asked questions
        </h2>
        <dl>
          <dt>Why is my draft not visible in Browse posts?</dt>
          <dd>
            Only published posts appear there. Submit the draft from My studio;
            a different assigned moderator must approve it first.
          </dd>
          <dt>Where can I find review feedback?</dt>
          <dd>
            Open the post’s Revision history in My studio. Rejected posts can be
            edited and resubmitted, with previous feedback kept in the history.
          </dd>
          <dt>Does upgrading charge my card?</dt>
          <dd>
            No. The upgrade uses only the displayed test card and saves a Paid
            plan without taking a payment.
          </dd>
          <dt>Are the featured authors and ratings real community reviews?</dt>
          <dd>
            No. They are labelled example data demonstrating the editorial card
            layout.
          </dd>
        </dl>
      </section>
      <section aria-labelledby="contact">
        <h2 id="contact" tabIndex={-1}>
          Contact Us
        </h2>
        <p>
          For questions about this student project, contact Romil Bijarnia at{" "}
          <a href="mailto:s222528574@deakin.edu.au">s222528574@deakin.edu.au</a>
          . This is a project contact, not a university helpdesk.
        </p>
      </section>
      <section aria-labelledby="privacy">
        <h2 id="privacy" tabIndex={-1}>
          Privacy Policy
        </h2>
        <p>
          These are data-use notes for this student prototype, not Deakin
          University’s privacy policy.
        </p>
        <ul>
          <li>
            Account names, email addresses and password hashes are stored in
            Firestore. Posts and review history are linked to account IDs.
          </li>
          <li>
            The browser stores a session token. Logging out removes the browser
            token and asks the server to revoke existing sessions.
          </li>
          <li>
            Drafts and review history are available to their author and assigned
            moderators. Public browsing includes only published posts the
            current account is entitled to read.
          </li>
          <li>
            Newsletter signup sends the email address to the server and the
            configured email provider to request a welcome message.
          </li>
          <li>
            The upgrade simulation saves the account plan, not the entered card
            number, expiry or security code.
          </li>
        </ul>
      </section>
      <section aria-labelledby="terms">
        <h2 id="terms" tabIndex={-1}>
          Terms
        </h2>
        <p>
          This is a student application, not an official university service.
          Membership prices and allowances are illustrative. A simulated upgrade
          does not create a real paid subscription.
        </p>
        <p>
          Use only the displayed test card. Share content you have permission to
          use and keep passwords, access keys and private information out of
          posts.
        </p>
      </section>
      <section aria-labelledby="conduct">
        <h2 id="conduct" tabIndex={-1}>
          Code of Conduct
        </h2>
        <p>
          Keep questions, articles and feedback relevant and constructive.
          Explain problems clearly, treat others respectfully and credit sources
          where appropriate. Do not publish someone else’s personal information.
        </p>
        <p>
          Review the work rather than its author. The workflow prevents authors
          from reviewing their own posts.
        </p>
      </section>
    </main>
  );
}
