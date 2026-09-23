export const articles = [
  {
    id: 'article-react-security',
    title: 'Designing Secure React Interfaces',
    description: 'Practical patterns for forms, validation, routing, and safe user feedback.',
    author: 'Romil Bijarnia',
    rating: '5.0',
    image: '/assets/project-portfolio.jpg',
    searchTerm: 'react'
  },
  {
    id: 'article-api-workflow',
    title: 'Connecting APIs to Frontend Pages',
    description: 'How frontend forms send requests, handle responses, and report errors clearly.',
    author: 'DEV@Deakin',
    rating: '4.9',
    image: '/assets/project-api.jpg',
    searchTerm: 'api'
  },
  {
    id: 'article-newsletter',
    title: 'Building a Newsletter Signup',
    description: 'A small full-stack feature that turns a static site into a connected app.',
    author: 'Romil Bijarnia',
    rating: '4.8',
    image: '/assets/project-newsletter.jpg',
    searchTerm: 'newsletter'
  }
];

export const tutorials = [
  {
    id: 'tutorial-routing',
    title: 'React Routing in DEV@Deakin',
    description: 'Build accessible routes for Home, Post, Login, Browse, and advanced features.',
    author: 'Romil Bijarnia',
    rating: '5.0',
    image: '/assets/gallery-code.jpg',
    duration: '12 minutes',
    level: 'Beginner',
    outcomes: [
      'Create a BrowserRouter route map',
      'Use NavLink to expose the active page',
      'Add a useful fallback route instead of a blank screen'
    ],
    sections: [
      {
        title: '1. Define the route map',
        body: 'Place one BrowserRouter around the application, then render each page through Routes and Route. Keep shared navigation and the footer outside Routes so they remain consistent.'
      },
      {
        title: '2. Make navigation state visible',
        body: 'Use NavLink for primary navigation. Its active state communicates location visually, while a descriptive aria-label keeps the navigation understandable to assistive technology.'
      },
      {
        title: '3. Verify direct navigation',
        body: 'Open every route directly, refresh it, and test keyboard focus. A deployed single-page app also needs a rewrite rule so a direct route returns index.html.'
      }
    ]
  },
  {
    id: 'tutorial-posts',
    title: 'Saving and Browsing Posts',
    description: 'Validate a post, upload its image, persist it, and refresh a filtered list.',
    author: 'DEV@Deakin',
    rating: '4.9',
    image: '/assets/gallery-team.jpg',
    duration: '16 minutes',
    level: 'Intermediate',
    outcomes: [
      'Validate conditional Question and Article fields',
      'Store image bytes separately from Firestore metadata',
      'Represent loading, empty, success, and error states honestly'
    ],
    sections: [
      {
        title: '1. Validate before writing',
        body: 'Normalize text, enforce the three-tag limit, and reject unsupported or oversized image files before starting a network request. Keep the submit button disabled while the write is in progress.'
      },
      {
        title: '2. Separate files from documents',
        body: 'Upload the image to Firebase Storage using a generated path. Store only the download URL and safe metadata in Firestore, then remove an orphaned upload if the document write fails.'
      },
      {
        title: '3. Refresh from the source',
        body: 'After creation, load the Browse page from Firestore again rather than assuming the write succeeded. Search and filters should operate on the refreshed records and expose a clear empty state.'
      }
    ]
  },
  {
    id: 'tutorial-auth',
    title: 'Firebase Authentication Workflow',
    description: 'Register, sign in, reset a password, and verify an email without exposing secrets.',
    author: 'Romil Bijarnia',
    rating: '4.7',
    image: '/assets/gallery-study.jpg',
    duration: '14 minutes',
    level: 'Intermediate',
    outcomes: [
      'Keep passwords outside application storage',
      'Map provider errors to useful user feedback',
      'Deliver verification through Firebase rather than displaying a code'
    ],
    sections: [
      {
        title: '1. Delegate credentials to Firebase Auth',
        body: 'The application sends credentials directly to Firebase Authentication. It stores only a minimal Firestore profile and never writes passwords or password hashes to localStorage.'
      },
      {
        title: '2. Recover access safely',
        body: 'Password recovery requests use the Firebase reset-email workflow. The confirmation remains generic so the interface does not reveal whether an address has an account.'
      },
      {
        title: '3. Verify out of band',
        body: 'Firebase sends a signed email-verification link. The application can reload the user record and display verified status, but it never generates or reveals a reusable verification code.'
      }
    ]
  }
];

export const subscriptionPlans = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    cadence: 'monthly',
    summary: 'For readers who want weekly DEV@Deakin updates and public tutorials.',
    features: ['Weekly digest', 'Public tutorial access', 'Community article browsing']
  },
  {
    id: 'student-plus',
    name: 'Student Plus',
    price: '$6',
    cadence: 'monthly',
    summary: 'For students who want saved learning paths and priority tutorial updates.',
    features: ['Saved learning path', 'Priority tutorial updates', 'Subscriber-only post filters']
  },
  {
    id: 'mentor',
    name: 'Mentor',
    price: '$12',
    cadence: 'monthly',
    summary: 'For students who want project review notes and advanced security content.',
    features: ['Project review notes', 'Advanced security lessons', 'Monthly portfolio checklist']
  }
];

export const seededPosts = [
  {
    id: 'post-seed-1',
    type: 'article',
    plan: 'Free',
    title: 'How I structured DEV@Deakin with React',
    topic: 'React routing',
    abstract: 'A short article about turning separate tasks into one cumulative React app.',
    body: 'The app uses reusable navigation, shared cards, route-based pages, and a persistence adapter so the user can post, browse, filter, and expand content in one consistent DEV@Deakin interface.',
    tags: ['react', 'routing', 'portfolio'],
    imageUrl: '/assets/project-portfolio.jpg',
    authorName: 'Romil Bijarnia',
    createdAt: '2026-07-06T00:00:00.000Z'
  },
  {
    id: 'post-seed-2',
    type: 'question',
    plan: 'Paid',
    title: 'How should a newsletter API validate input?',
    topic: 'API validation',
    problem: 'I want the backend API to reject invalid emails, avoid duplicate newsletter subscribers, and return helpful HTTP status codes.',
    tags: ['api', 'newsletter', 'validation'],
    imageUrl: '/assets/project-api.jpg',
    authorName: 'DEV@Deakin',
    createdAt: '2026-07-06T01:00:00.000Z'
  }
];
