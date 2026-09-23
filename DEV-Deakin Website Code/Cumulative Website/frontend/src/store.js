import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { seededPosts } from './content';
import {
  getFirebaseServices,
  getPersistenceMode,
  isFirebaseConfigured,
  isFirebaseStorageConfigured
} from './firebase';

const postKey = 'devdeakin.posts';
const hiddenPostKey = 'devdeakin.hiddenPosts';
const messageKey = 'devdeakin.secureMessages.v2';
const tutorialMetricKey = 'devdeakin.tutorialMetrics.v2';
const tutorialRatingKey = 'devdeakin.tutorialRatings.v2';
const tutorialCommentKey = 'devdeakin.tutorialComments.v2';
const subscriptionKey = 'devdeakin.subscriptions';
const MAX_POST_IMAGE_SIZE = 5 * 1024 * 1024;
const ROOM_ID = 'dev-deakin-project';

let activeUser = null;

class UserFacingError extends Error {
  constructor(message, code = 'app/error') {
    super(message);
    this.name = 'UserFacingError';
    this.code = code;
  }
}

// Local storage is an explicitly labelled demonstration adapter. Parse failures
// fail closed to a safe default rather than leaking corrupt state into React.
function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new UserFacingError(
      'Local demo storage is full. Remove a large uploaded image or clear this site’s demo data and try again.',
      'local-storage/full'
    );
  }
}

function normalizeEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new UserFacingError('Enter a valid email address.', 'validation/email');
  }
  return email;
}

function normalizeName(value, label) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) throw new UserFacingError(`Enter your ${label}.`, `validation/${label}`);
  if (name.length > 100) {
    throw new UserFacingError(
      `${label[0].toUpperCase()}${label.slice(1)} must be 100 characters or fewer.`,
      `validation/${label}`
    );
  }
  return name;
}

function validateRegistrationPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new UserFacingError('Use at least 8 characters for the password.', 'validation/password');
  }
  if (password.length > 4096) {
    throw new UserFacingError('The password is too long.', 'validation/password');
  }
  return password;
}

function validateLoginPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new UserFacingError('Enter your password.', 'validation/password');
  }
  if (password.length > 4096) {
    throw new UserFacingError('The password is too long.', 'validation/password');
  }
  return password;
}

function toIsoDate(value, fallback = null) {
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return fallback;
}

// Firebase credentials never cross this boundary. UI state receives only the
// allow-listed profile fields required to render account-aware routes.
function toSafeUser(firebaseUser, profile, createdAtFallback = null) {
  const firstName = typeof profile?.firstName === 'string' ? profile.firstName.trim() : '';
  const lastName = typeof profile?.lastName === 'string' ? profile.lastName.trim() : '';

  if (!firstName || !lastName) {
    throw new UserFacingError('Your account profile is incomplete.', 'profile/incomplete');
  }

  return Object.freeze({
    id: firebaseUser.uid,
    uid: firebaseUser.uid,
    firstName,
    lastName,
    email: firebaseUser.email || '',
    emailVerified: Boolean(firebaseUser.emailVerified),
    createdAt: toIsoDate(
      profile?.createdAt,
      createdAtFallback || firebaseUser.metadata?.creationTime || null
    )
  });
}

function mapFirebaseError(error, fallback = 'The service is temporarily unavailable. Please try again.') {
  if (error instanceof UserFacingError) return error;

  const messages = {
    'auth/email-already-in-use': 'An account already exists for that email address.',
    'auth/invalid-credential': 'The email and password do not match.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/missing-password': 'Enter your password.',
    'auth/network-request-failed': 'Firebase could not be reached. Check your connection and try again.',
    'auth/operation-not-allowed': 'Email and password sign-in is not enabled for this application.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/user-not-found': 'The email and password do not match.',
    'auth/weak-password': 'Use a stronger password with at least 8 characters.',
    'auth/wrong-password': 'The email and password do not match.',
    'firebase/config-missing': 'Firebase is not configured for this build.',
    'firestore/permission-denied': 'You do not have access to this Firebase data.',
    'firestore/unavailable': 'Firestore is temporarily unavailable. Please try again.',
    'storage/unauthorized': 'You do not have permission to upload this image.',
    'storage/retry-limit-exceeded': 'The image upload timed out. Please try again.',
    'storage/unknown': 'Firebase Storage could not save the image.',
    'permission-denied': 'You do not have access to this Firebase data.',
    unavailable: 'Firebase is temporarily unavailable. Please try again.'
  };

  return new UserFacingError(messages[error?.code] || fallback, error?.code || 'firebase/error');
}

async function loadProfile(firebaseUser, db) {
  const profileSnapshot = await getDoc(doc(db, 'users', firebaseUser.uid));
  if (!profileSnapshot.exists()) {
    throw new UserFacingError('Your account profile is unavailable.', 'profile/missing');
  }
  return toSafeUser(firebaseUser, profileSnapshot.data());
}

// Every Firestore/Storage write rechecks the live Firebase identity instead of
// trusting a user object previously cached by the component tree.
async function requireFirebaseUser() {
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) {
    throw new UserFacingError('Sign in to use this Firebase feature.', 'auth/required');
  }
  if (!activeUser || activeUser.uid !== auth.currentUser.uid) {
    activeUser = await loadProfile(auth.currentUser, db);
  }
  return { authUser: auth.currentUser, profile: activeUser, db };
}

export function getRuntimeMode() {
  return getPersistenceMode();
}

// Registration is a compensating transaction: if the profile write fails after
// Auth creation, the new Auth user is deleted to avoid a half-created account.
export async function createUser(form = {}) {
  const firstName = normalizeName(form.firstName, 'first name');
  const lastName = normalizeName(form.lastName, 'last name');
  const email = normalizeEmail(form.email);
  const password = validateRegistrationPassword(form.password);

  if (
    Object.prototype.hasOwnProperty.call(form, 'confirmPassword') &&
    password !== form.confirmPassword
  ) {
    throw new UserFacingError('The passwords do not match.', 'validation/password-match');
  }

  const registeredAt = new Date().toISOString();
  let firebaseUser = null;
  let profileWritten = false;
  let auth = null;

  try {
    const services = getFirebaseServices();
    auth = services.auth;
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    firebaseUser = credential.user;
    const profile = {
      firstName,
      lastName,
      email,
      createdAt: serverTimestamp()
    };

    await setDoc(doc(services.db, 'users', firebaseUser.uid), profile);
    profileWritten = true;
    const safeUser = toSafeUser(firebaseUser, { ...profile, createdAt: registeredAt }, registeredAt);
    await signOut(auth);
    activeUser = null;
    return safeUser;
  } catch (error) {
    let rollbackFailed = false;
    if (firebaseUser && !profileWritten) {
      try {
        await deleteUser(firebaseUser);
      } catch {
        rollbackFailed = true;
      }
    }
    if (auth?.currentUser) {
      try {
        await signOut(auth);
      } catch {
        // Preserve the original error.
      }
    }
    activeUser = null;
    if (rollbackFailed) {
      throw new UserFacingError(
        'The sign-in was created, but its profile could not be saved.',
        'profile/rollback-failed'
      );
    }
    throw mapFirebaseError(error, 'The account could not be created. Please try again.');
  }
}

export async function loginUser(emailValue, passwordValue) {
  const email = normalizeEmail(emailValue);
  const password = validateLoginPassword(passwordValue);
  let credential = null;
  let auth = null;

  try {
    const services = getFirebaseServices();
    auth = services.auth;
    credential = await signInWithEmailAndPassword(auth, email, password);
    const safeUser = await loadProfile(credential.user, services.db);
    activeUser = safeUser;
    return safeUser;
  } catch (error) {
    if (credential) {
      try {
        await signOut(auth);
      } catch {
        // The observer reconciles any remaining session.
      }
    }
    activeUser = null;
    throw mapFirebaseError(error, 'Login failed. Please try again.');
  }
}

export function getActiveUser() {
  return activeUser;
}

export async function logoutUser() {
  if (!isFirebaseConfigured) {
    activeUser = null;
    return;
  }
  try {
    const { auth } = getFirebaseServices();
    await signOut(auth);
    activeUser = null;
  } catch (error) {
    throw mapFirebaseError(error, 'Sign out failed. Please try again.');
  }
}

// A monotonically increasing observation id discards profile reads that finish
// after Firebase has already emitted a newer authentication state.
export function subscribeToAuthState(callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('subscribeToAuthState requires a callback function.');
  }

  if (!isFirebaseConfigured) {
    activeUser = null;
    callback(null, null);
    return () => {};
  }

  const { auth, db } = getFirebaseServices();
  let observationVersion = 0;
  const unsubscribe = onAuthStateChanged(
    auth,
    async (firebaseUser) => {
      const version = ++observationVersion;
      if (!firebaseUser) {
        activeUser = null;
        callback(null, null);
        return;
      }
      try {
        const safeUser = await loadProfile(firebaseUser, db);
        if (version !== observationVersion || auth.currentUser?.uid !== firebaseUser.uid) return;
        activeUser = safeUser;
        callback(safeUser, null);
      } catch (error) {
        if (version !== observationVersion) return;
        activeUser = null;
        callback(null, mapFirebaseError(error));
      }
    },
    (error) => {
      activeUser = null;
      callback(null, mapFirebaseError(error));
    }
  );

  return () => {
    observationVersion += 1;
    unsubscribe();
  };
}

export async function requestPasswordReset(emailValue) {
  const email = normalizeEmail(emailValue);
  try {
    const { auth } = getFirebaseServices();
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    throw mapFirebaseError(error, 'The password-reset email could not be sent.');
  }
}

export async function sendVerificationLink() {
  try {
    const { auth } = getFirebaseServices();
    if (!auth.currentUser) {
      throw new UserFacingError('Sign in before requesting email verification.', 'auth/required');
    }
    if (auth.currentUser.emailVerified) return { alreadyVerified: true };
    await sendEmailVerification(auth.currentUser);
    return { alreadyVerified: false };
  } catch (error) {
    throw mapFirebaseError(error, 'The verification email could not be sent.');
  }
}

export async function refreshVerificationStatus() {
  try {
    const { auth, db } = getFirebaseServices();
    if (!auth.currentUser) {
      throw new UserFacingError('Sign in before checking verification.', 'auth/required');
    }
    await reload(auth.currentUser);
    activeUser = await loadProfile(auth.currentUser, db);
    return activeUser;
  } catch (error) {
    throw mapFirebaseError(error, 'Verification status could not be refreshed.');
  }
}

// Firestore snapshots are normalized into one UI model so local-demo and cloud
// adapters expose the same safe, sortable record shape.
function mapPostSnapshot(snapshot) {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    type: data.type,
    plan: data.plan,
    title: data.title,
    topic: data.topic || '',
    problem: data.problem || '',
    abstract: data.abstract || '',
    body: data.body || '',
    tags: Array.isArray(data.tags) ? data.tags : [],
    imageUrl: data.imageUrl || '',
    storagePath: data.storagePath || '',
    authorId: data.authorId || '',
    authorName: data.authorName || 'DEV@Deakin member',
    createdAt: toIsoDate(data.createdAt, new Date().toISOString())
  };
}

// Source refresh is adapter-driven. Local data is labelled; Firebase mode reads
// a bounded, newest-first query instead of an unbounded collection scan.
export async function getPosts() {
  if (!isFirebaseConfigured) {
    const saved = readJson(postKey, null);
    if (Array.isArray(saved)) return { items: saved, mode: 'local-demo' };
    writeJson(postKey, seededPosts);
    return { items: seededPosts, mode: 'local-demo' };
  }

  try {
    const { db } = getFirebaseServices();
    const snapshot = await getDocs(
      query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(100))
    );
    return { items: snapshot.docs.map(mapPostSnapshot), mode: 'firebase' };
  } catch (error) {
    throw mapFirebaseError(error, 'Posts could not be loaded from Firestore.');
  }
}

function getSafeExtension(file) {
  const extensions = {
    'image/avif': 'avif',
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  };
  return extensions[file?.type] || 'img';
}

// Client checks improve feedback, while Storage rules repeat type, size and
// ownership enforcement at the server-authorized trust boundary.
function validateImageFile(file) {
  if (!file) return;
  const safeTypes = new Set([
    'image/avif',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]);
  if (!safeTypes.has(file.type)) {
    throw new UserFacingError('Choose a valid image file.', 'validation/image-type');
  }
  if (file.size > MAX_POST_IMAGE_SIZE) {
    throw new UserFacingError('Choose an image that is 5 MB or smaller.', 'validation/image-size');
  }
}

// The image is uploaded before metadata so the document receives a stable URL.
// A failed Firestore write deletes that object as a compensating action.
export async function savePost(post, options = {}) {
  const imageFile = options.imageFile || null;
  validateImageFile(imageFile);

  if (!isFirebaseConfigured) {
    const current = await getPosts();
    const savedPost = {
      ...post,
      id: `local-post-${crypto.randomUUID?.() || Date.now()}`,
      authorId: 'local-demo',
      authorName: 'Local demo author',
      createdAt: new Date().toISOString()
    };
    writeJson(postKey, [savedPost, ...current.items]);
    return { item: savedPost, mode: 'local-demo' };
  }

  let uploadedRef = null;
  try {
    const { authUser, profile, db } = await requireFirebaseUser();
    const services = getFirebaseServices();
    const postRef = doc(collection(db, 'posts'));
    let imageUrl = '';
    let storagePath = '';

    if (imageFile) {
      if (!isFirebaseStorageConfigured || !services.storage) {
        throw new UserFacingError(
          'Firebase Storage is not configured, so the selected image cannot be uploaded.',
          'storage/config-missing'
        );
      }
      storagePath = `post-images/${authUser.uid}/${postRef.id}/image.${getSafeExtension(imageFile)}`;
      uploadedRef = ref(services.storage, storagePath);
      await uploadBytes(uploadedRef, imageFile, {
        contentType: imageFile.type,
        cacheControl: 'public,max-age=3600'
      });
      imageUrl = await getDownloadURL(uploadedRef);
    }

    const createdAt = new Date().toISOString();
    const record = {
      type: post.type,
      plan: post.plan,
      title: post.title,
      topic: post.topic || '',
      problem: post.problem || '',
      abstract: post.abstract || '',
      body: post.body || '',
      tags: post.tags || [],
      imageUrl,
      storagePath,
      authorId: authUser.uid,
      authorName: `${profile.firstName} ${profile.lastName}`,
      createdAt: serverTimestamp()
    };
    await setDoc(postRef, record);
    return {
      item: { ...record, id: postRef.id, createdAt },
      mode: 'firebase'
    };
  } catch (error) {
    if (uploadedRef) {
      try {
        await deleteObject(uploadedRef);
      } catch {
        // The original write error is more useful to the user.
      }
    }
    throw mapFirebaseError(error, 'The post could not be saved to Firebase.');
  }
}

export function getHiddenPostIds() {
  const ids = readJson(hiddenPostKey, []);
  return Array.isArray(ids) ? ids : [];
}

export function hidePost(id) {
  const hidden = new Set(getHiddenPostIds());
  hidden.add(id);
  writeJson(hiddenPostKey, [...hidden]);
}

export function resetHiddenPosts() {
  writeJson(hiddenPostKey, []);
}

export function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new UserFacingError('The image could not be read.'));
    reader.readAsDataURL(file);
  });
}

function randomNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value) {
  if (!crypto?.subtle) {
    throw new UserFacingError('This browser does not support Web Crypto integrity checks.');
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Canonical field order is shared by write and read verification; changing any
// identity, timestamp, nonce or text field necessarily changes the digest.
function messageCanonicalValue(message) {
  return [
    message.senderId,
    message.senderName,
    message.clientCreatedAt,
    message.nonce,
    message.text
  ].join('\n');
}

async function createMessageEnvelope(text, senderId, senderName) {
  const message = {
    text: text.trim(),
    senderId,
    senderName,
    clientCreatedAt: new Date().toISOString(),
    nonce: randomNonce(),
    integrityVersion: 'sha256-v1'
  };
  return { ...message, integrityHash: await sha256(messageCanonicalValue(message)) };
}

// Integrity is recomputed for every read rather than trusting a stored badge.
async function withIntegrityState(message) {
  if (message.integrityVersion !== 'sha256-v1' || !message.integrityHash) {
    return { ...message, integrityState: 'unavailable' };
  }
  const calculated = await sha256(messageCanonicalValue(message));
  return {
    ...message,
    integrityState: calculated === message.integrityHash ? 'verified' : 'failed'
  };
}

async function getLocalMessages() {
  let messages = readJson(messageKey, null);
  if (!Array.isArray(messages)) {
    const seed = await createMessageEnvelope(
      'Local demo room ready. Firebase configuration enables authenticated cross-device messages.',
      'local-demo',
      'Local demo'
    );
    messages = [{ ...seed, id: 'local-message-seed', createdAt: seed.clientCreatedAt }];
    writeJson(messageKey, messages);
  }
  return Promise.all(messages.map(withIntegrityState));
}

// Collaboration reads stay bounded and every returned envelope carries a fresh
// integrity result before React renders it.
export async function loadCollaborationMessages() {
  if (!isFirebaseConfigured) {
    return { items: await getLocalMessages(), mode: 'local-demo' };
  }

  try {
    const { db } = await requireFirebaseUser();
    const snapshot = await getDocs(
      query(
        collection(db, 'collaborationRooms', ROOM_ID, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(40)
      )
    );
    const messages = await Promise.all(
      snapshot.docs.map((item) => {
        const data = item.data();
        return withIntegrityState({
          id: item.id,
          ...data,
          createdAt: toIsoDate(data.createdAt, data.clientCreatedAt)
        });
      })
    );
    return { items: messages, mode: 'firebase' };
  } catch (error) {
    throw mapFirebaseError(error, 'Collaboration messages could not be loaded.');
  }
}

// Firebase mode binds the envelope to the authenticated UID; local mode uses a
// conspicuously labelled demo identity and never claims cross-device security.
export async function saveSecureMessage(textValue) {
  const text = typeof textValue === 'string' ? textValue.trim() : '';
  if (!text) throw new UserFacingError('Write a message before sending it.');
  if (text.length > 1000) throw new UserFacingError('Keep the message to 1,000 characters or fewer.');

  if (!isFirebaseConfigured) {
    const envelope = await createMessageEnvelope(text, 'local-demo', 'Local demo user');
    const saved = {
      ...envelope,
      id: `local-message-${crypto.randomUUID?.() || Date.now()}`,
      createdAt: envelope.clientCreatedAt,
      integrityState: 'verified'
    };
    const current = await getLocalMessages();
    writeJson(messageKey, [saved, ...current.map(({ integrityState, ...message }) => message)]);
    return { item: saved, mode: 'local-demo' };
  }

  try {
    const { profile, db } = await requireFirebaseUser();
    const envelope = await createMessageEnvelope(
      text,
      profile.uid,
      `${profile.firstName} ${profile.lastName}`
    );
    const document = await addDoc(collection(db, 'collaborationRooms', ROOM_ID, 'messages'), {
      ...envelope,
      createdAt: serverTimestamp()
    });
    return {
      item: {
        ...envelope,
        id: document.id,
        createdAt: envelope.clientCreatedAt,
        integrityState: 'verified'
      },
      mode: 'firebase'
    };
  } catch (error) {
    throw mapFirebaseError(error, 'The collaboration message could not be saved.');
  }
}

// The local adapter mirrors Firestore aggregates for interface testing only;
// mode notices prevent these browser records from becoming cloud evidence.
function localTutorialState(tutorialId) {
  const metrics = readJson(tutorialMetricKey, {});
  const ratings = readJson(tutorialRatingKey, {});
  const comments = readJson(tutorialCommentKey, {});
  const rating = Number(ratings[tutorialId] || 0);
  return {
    views: Number(metrics[tutorialId]?.views || 0),
    averageRating: rating,
    ratingCount: rating ? 1 : 0,
    userRating: rating,
    comments: Array.isArray(comments[tutorialId]) ? comments[tutorialId] : [],
    mode: 'local-demo'
  };
}

// Views, ratings and comments are loaded together so React can commit a coherent
// engagement snapshot after each source refresh.
export async function loadTutorialEngagement(tutorialId) {
  if (!isFirebaseConfigured) return localTutorialState(tutorialId);

  try {
    const { profile, db } = await requireFirebaseUser();
    const tutorialRef = doc(db, 'tutorials', tutorialId);
    const [tutorialSnapshot, ratingsSnapshot, commentsSnapshot] = await Promise.all([
      getDoc(tutorialRef),
      getDocs(collection(tutorialRef, 'ratings')),
      getDocs(query(collection(tutorialRef, 'comments'), orderBy('createdAt', 'desc'), limit(50)))
    ]);
    const ratings = ratingsSnapshot.docs.map((item) => item.data());
    const total = ratings.reduce((sum, item) => sum + Number(item.rating || 0), 0);
    const ownRating = ratings.find((item) => item.userId === profile.uid)?.rating || 0;
    const comments = commentsSnapshot.docs.map((item) => {
      const data = item.data();
      return {
        id: item.id,
        ...data,
        createdAt: toIsoDate(data.createdAt, new Date().toISOString())
      };
    });
    return {
      views: Number(tutorialSnapshot.data()?.views || 0),
      averageRating: ratings.length ? total / ratings.length : 0,
      ratingCount: ratings.length,
      userRating: Number(ownRating),
      comments,
      mode: 'firebase'
    };
  } catch (error) {
    throw mapFirebaseError(error, 'Tutorial activity could not be loaded.');
  }
}

// Firestore increments are atomic; the component separately de-duplicates the
// side effect once per tutorial and browser session.
export async function recordTutorialView(tutorialId) {
  if (!isFirebaseConfigured) {
    const metrics = readJson(tutorialMetricKey, {});
    metrics[tutorialId] = { views: Number(metrics[tutorialId]?.views || 0) + 1 };
    writeJson(tutorialMetricKey, metrics);
    return localTutorialState(tutorialId);
  }

  try {
    const { db } = await requireFirebaseUser();
    await setDoc(
      doc(db, 'tutorials', tutorialId),
      { views: increment(1), updatedAt: serverTimestamp() },
      { merge: true }
    );
    return loadTutorialEngagement(tutorialId);
  } catch (error) {
    throw mapFirebaseError(error, 'The tutorial view could not be recorded.');
  }
}

// The authenticated UID is the rating document id, enforcing one mutable rating
// per user while aggregate values are recomputed from source documents.
export async function saveTutorialRating(tutorialId, ratingValue) {
  const rating = Number(ratingValue);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new UserFacingError('Choose a rating from 1 to 5.');
  }

  if (!isFirebaseConfigured) {
    const ratings = readJson(tutorialRatingKey, {});
    ratings[tutorialId] = rating;
    writeJson(tutorialRatingKey, ratings);
    return localTutorialState(tutorialId);
  }

  try {
    const { profile, db } = await requireFirebaseUser();
    await setDoc(doc(db, 'tutorials', tutorialId, 'ratings', profile.uid), {
      userId: profile.uid,
      rating,
      updatedAt: serverTimestamp()
    });
    return loadTutorialEngagement(tutorialId);
  } catch (error) {
    throw mapFirebaseError(error, 'The tutorial rating could not be saved.');
  }
}

// Comments are normalized, length-bounded and author-bound before Firestore
// creates an immutable record with a server timestamp.
export async function saveTutorialComment(tutorialId, commentValue) {
  const text = typeof commentValue === 'string' ? commentValue.trim() : '';
  if (!text) throw new UserFacingError('Write a comment before posting it.');
  if (text.length > 500) throw new UserFacingError('Keep the comment to 500 characters or fewer.');

  if (!isFirebaseConfigured) {
    const comments = readJson(tutorialCommentKey, {});
    const item = {
      id: `local-comment-${crypto.randomUUID?.() || Date.now()}`,
      text,
      authorId: 'local-demo',
      authorName: 'Local demo user',
      createdAt: new Date().toISOString()
    };
    comments[tutorialId] = [item, ...(comments[tutorialId] || [])];
    writeJson(tutorialCommentKey, comments);
    return localTutorialState(tutorialId);
  }

  try {
    const { profile, db } = await requireFirebaseUser();
    await addDoc(collection(db, 'tutorials', tutorialId, 'comments'), {
      text,
      authorId: profile.uid,
      authorName: `${profile.firstName} ${profile.lastName}`,
      createdAt: serverTimestamp()
    });
    return loadTutorialEngagement(tutorialId);
  } catch (error) {
    throw mapFirebaseError(error, 'The tutorial comment could not be saved.');
  }
}

export function getSubscriptions() {
  const subscriptions = readJson(subscriptionKey, [
    {
      id: 'sub-seed-student-plus',
      planId: 'student-plus',
      planName: 'Student Plus',
      name: 'Romil Bijarnia',
      email: 'romil.demo@example.com',
      billingCycle: 'monthly',
      status: 'active',
      createdAt: '2026-07-07T09:00:00.000Z',
      receiptId: 'receipt-seed-d2',
      source: 'local-demo'
    }
  ]);
  return Array.isArray(subscriptions) ? subscriptions : [];
}

// The browser retains management capabilities because the server returns each
// raw token only once. Refreshed public records are reattached by id in React.
export function replaceSubscriptions(subscriptions) {
  const safeSubscriptions = Array.isArray(subscriptions) ? subscriptions : [];
  writeJson(subscriptionKey, safeSubscriptions);
  return safeSubscriptions;
}

export function saveSubscription(subscription) {
  const subscriptions = getSubscriptions();
  const saved = {
    ...subscription,
    id: subscription.id || `sub-${Date.now()}`,
    status: subscription.status || 'active',
    createdAt: subscription.createdAt || new Date().toISOString()
  };
  writeJson(subscriptionKey, [saved, ...subscriptions.filter((item) => item.id !== saved.id)]);
  return saved;
}

export function cancelSubscription(id) {
  const subscriptions = getSubscriptions().map((subscription) =>
    subscription.id === id
      ? { ...subscription, status: 'cancelled', cancelledAt: new Date().toISOString() }
      : subscription
  );
  writeJson(subscriptionKey, subscriptions);
  return subscriptions;
}
