// Import Firebase modules - MUST BE AT THE TOP LEVEL OF THE MODULE
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, getDoc, collection, addDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Get the critical error message display element early (before DOMContentLoaded)
const criticalErrorMessageDiv = document.getElementById('criticalErrorMessage');

/**
 * Displays a critical error message on the page and in the console.
 * @param {string} message - The error message to display.
 */
function showCriticalError(message) {
    console.error("CRITICAL WEBSITE ERROR:", message);
    if (criticalErrorMessageDiv) {
        criticalErrorMessageDiv.textContent = `Error: ${message}`;
        criticalErrorMessageDiv.style.display = 'block';
    }
}

let app = null; // Initialize to null, will hold Firebase app instance
let db = null;  // Initialize to null, will hold Firestore instance
let auth = null; // Initialize to null, will hold Firebase Auth instance

// Wrap the entire application logic in DOMContentLoaded to ensure elements are ready
window.addEventListener('DOMContentLoaded', async () => {
    try {
        // Global variables for Firebase configuration (provided by the environment)
        // These are typically injected by a secure environment like Canvas.
        // For local development, they will likely be `undefined`, so we provide placeholders.
        const appId = typeof __app_id !== 'undefined' && __app_id !== null ? String(__app_id) : '';
        let firebaseConfig = {
            // !!! IMPORTANT: YOU MUST REPLACE THESE PLACEHOLDER VALUES !!!
            // Go to your Firebase project console:
            // 1. Log in to Firebase: https://console.firebase.google.com/
            // 2. Select your project.
            // 3. Go to "Project settings" (gear icon next to "Project overview").
            // 4. In the "General" tab, scroll down to "Your apps".
            // 5. Select "Config" for your web app to get these values.
            apiKey: "YOUR_API_KEY", // <-- REPLACE THIS with your actual apiKey
            authDomain: "YOUR_PROJECT_ID.firebaseapp.com", // <-- REPLACE THIS (e.g., your-project-id.firebaseapp.com)
            projectId: "YOUR_PROJECT_ID", // <-- REPLACE THIS (e.g., your-project-id)
            storageBucket: "YOUR_PROJECT_ID.appspot.com", // <-- REPLACE THIS (e.g., your-project-id.appspot.com)
            messagingSenderId: "YOUR_MESSAGING_SENDER_ID", // <-- REPLACE THIS
            appId: "YOUR_APP_ID" // <-- REPLACE THIS
        };

        try {
            // This block attempts to merge/override with config from the Canvas environment
            if (typeof __firebase_config !== 'undefined' && __firebase_config !== null && String(__firebase_config).trim() !== '') {
                const parsedConfig = JSON.parse(String(__firebase_config));
                // Merge provided config with placeholders, prioritizing provided values
                firebaseConfig = { ...firebaseConfig, ...parsedConfig };
            }
        } catch (e) {
            showCriticalError(`Failed to parse Firebase config from environment: ${e.message}. Using default placeholder config.`);
            // firebaseConfig remains the default placeholder object if parsing fails
        }
        const initialAuthToken = typeof __initial_auth_token !== 'undefined' && __initial_auth_token !== null ? String(__initial_auth_token) : null; 

        // --- Console Logs for Debugging Firebase Initialization ---
        console.log("Website Startup: Initializing Firebase...");
        console.log("App ID:", appId);
        console.log("Firebase Config (parsed):", firebaseConfig);
        console.log("Initial Auth Token:", initialAuthToken ? 'Present' : 'Not Present');

        // Initialize Firebase app
        try {
            // Check if firebaseConfig is effectively empty (e.g., if placeholders weren't replaced).
            // initializeApp will fail if critical config fields (like apiKey) are missing.
            if (Object.keys(firebaseConfig).length === 0 || !firebaseConfig.apiKey || firebaseConfig.apiKey === "YOUR_API_KEY") {
                console.warn("Firebase config appears incomplete or empty. Anonymous sign-in will be attempted, but database operations may fail without proper project setup. Please replace 'YOUR_API_KEY' and other placeholders in script.js.");
            }
            app = initializeApp(firebaseConfig);
            db = getFirestore(app);
            auth = getAuth(app);
            console.log("Firebase initialized successfully.");
        } catch (e) {
            // Firebase initialization can fail if the config is totally invalid or services aren't enabled.
            showCriticalError(`Firebase Initialization Error: ${e.message}. Ensure your Firebase project's configuration is correct and that services like Authentication (Anonymous) and Firestore Database are enabled.`);
            return; // Stop execution if Firebase init fails to prevent further errors
        }

        // --- DOM Elements ---
        // Get elements only after DOM is fully loaded and Firebase is initialized.
        // It's good practice to add checks (e.g., `if (element)`) when accessing elements
        // just in case they might not exist, though in this simple structure they should.
        const homePage = document.getElementById('homePage');
        const userProfileBox = document.getElementById('userProfileBox');
        const pointsDisplayTopRight = document.getElementById('pointsDisplayTopRight');
        const goToHomePageButton = document.getElementById('goToHomePageButton');
        const goToGalleryPageButton = document.getElementById('goToGalleryPageButton');
        const claimDailyRewardButton = document.getElementById('claimDailyRewardButton');
        const claimDailyButtonText = document.getElementById('claimDailyButtonText');
        const claimDailyLoadingSpinner = document.getElementById('claimDailyLoadingSpinner');
        const dailyRewardMessage = document.getElementById('dailyRewardMessage');
        const photoInput = document.getElementById('photoInput');
        const submitPhotoButton = document.getElementById('submitPhotoButton');
        const submitPhotoButtonText = document.getElementById('submitPhotoButtonText');
        const submitPhotoLoadingSpinner = document.getElementById('submitPhotoLoadingSpinner');
        const submitPhotoMessage = document.getElementById('submitPhotoMessage');
        const claimPhotoRewardButton = document.getElementById('claimPhotoRewardButton');
        const claimPhotoButtonText = document.getElementById('claimPhotoButtonText');
        const claimPhotoLoadingSpinner = document.getElementById('claimPhotoLoadingSpinner');
        const photoRewardMessage = document.getElementById('photoRewardMessage');
        const emailUserIdDisplay = document.getElementById('emailUserIdDisplay');


        // Global state for points and last claimed dates
        let currentUserId = null;
        let authReady = false;
        let points = 0;
        let lastDailyClaimedDate = null;
        let lastPhotoEarnDate = null;
        let photoSubmittedDate = null; // When photo was "submitted" to gallery in the website

        // --- Utility Functions ---
        /**
         * Shows the specified page element and hides others, managing the user profile box visibility.
         * @param {HTMLElement} pageElement - The page element to show.
         */
        function showPage(pageElement) {
            // Assume any major content sections have a common class, e.g., 'main-content-page'
            // For this app, only homePage is explicitly managed for showing/hiding.
            // If you add more main pages, give them a common class and iterate:
            // document.querySelectorAll('.main-content-page').forEach(page => page.classList.add('hidden-page'));
            if (homePage) homePage.classList.add('hidden-page');
            
            // Show/hide userProfileBox based on which page is active (only homePage in this context)
            if (userProfileBox) {
                if (pageElement === homePage) {
                    userProfileBox.classList.remove('hidden');
                } else {
                    userProfileBox.classList.add('hidden');
                }
            }
            if (pageElement) pageElement.classList.remove('hidden-page');
        }

        /**
         * Displays a message in a designated message element.
         * @param {HTMLElement} element - The HTML element to display the message in.
         * @param {string} message - The message text.
         * @param {'success'|'error'|'info'|'warning'} type - The type of message to determine styling.
         */
        function showMessage(element, message, type = 'success') {
            if (!element) return;
            element.textContent = message;
            // Remove all existing type-related classes
            element.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700', 'bg-blue-100', 'text-blue-700', 'bg-yellow-100', 'text-yellow-700');
            // Add classes based on message type
            if (type === 'success') {
                element.classList.add('bg-green-100', 'text-green-700');
            } else if (type === 'error') {
                element.classList.add('bg-red-100', 'text-red-700');
            } else if (type === 'info') {
                 element.classList.add('bg-blue-100', 'text-blue-700');
            } else if (type === 'warning') {
                element.classList.add('bg-yellow-100', 'text-yellow-700');
            }
            element.classList.remove('hidden'); // Ensure message box is visible
        }

        /**
         * Hides a message element.
         * @param {HTMLElement} element - The HTML element to hide.
         */
        function hideMessage(element) {
            if (element) {
                element.classList.add('hidden');
            }
        }

        // Removed showLoading and hideLoading functions entirely as per user request


        // COOLDOWN CONSTANTS (in milliseconds) - Changed to 1 day (24 hours)
        const DAILY_REWARD_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
        const PHOTO_SUBMISSION_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
        const PHOTO_CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

        /**
         * Formats a time duration in milliseconds into a human-readable string (e.g., "1d 5h 30m").
         * @param {number} ms - The time remaining in milliseconds.
         * @returns {string} The formatted time string.
         */
        function formatTimeRemaining(ms) {
            const days = Math.floor(ms / (1000 * 60 * 60 * 24));
            const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((ms % (1000 * 60)) / 1000);

            let parts = [];
            if (days > 0) parts.push(`${days}d`);
            if (hours > 0) parts.push(`${hours}h`);
            if (minutes > 0) parts.push(`${minutes}m`);
            if (parts.length === 0 || seconds > 0) parts.push(`${seconds}s`); // Always show seconds if nothing else or if seconds are present

            return parts.join(' ');
        }

        // --- Authentication ---
        // onAuthStateChanged is the primary listener for user authentication state.
        // It runs once on page load and then whenever the user's sign-in state changes.
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                currentUserId = user.uid;
                authReady = true;
                showPage(homePage); // Show the main content once user is authenticated
                loadRewardData(currentUserId); // Load user-specific data
                console.log("Firebase Auth: User signed in:", user.uid);
            } else {
                console.log("Firebase Auth: No user signed in. Attempting anonymous sign-in...");
                try {
                    // Try to sign in anonymously. This is ideal for quick starts without login forms.
                    if (initialAuthToken) {
                        await signInWithCustomToken(auth, initialAuthToken);
                        console.log("Firebase Auth: Signed in with custom token.");
                    } else {
                        await signInAnonymously(auth);
                        console.log("Firebase Auth: Signed in anonymously.");
                    }
                } catch (error) {
                    console.error("Firebase Auth Error (onAuthStateChanged / signIn):", error);
                    showCriticalError(`Authentication failed: ${error.message}. Website functionality may be limited. Ensure Firebase anonymous authentication is enabled in your project.`);
                    authReady = false; // Mark auth as not ready for data operations
                    showPage(homePage); // Still show home page, but features might be disabled/erroring
                }
            }
        });

        // --- Navigation ---
        if (goToHomePageButton) {
            goToHomePageButton.addEventListener('click', () => {
                // This button is on the home page, so no action needed on click for itself
                console.log("Navigated to Home page (already on it).");
            });
        }
        if (goToGalleryPageButton) {
            goToGalleryPageButton.addEventListener('click', () => {
                console.log("Navigating to gallery.html...");
                window.location.href = 'gallery.html'; // Navigate to gallery.html
            });
        }

        // --- Home Page Logic ---

        /**
         * Loads user-specific reward data from Firestore and sets up a real-time listener.
         * @param {string} userId - The ID of the current user.
         */
        function loadRewardData(userId) {
            // Ensure Firebase is initialized and user is authenticated before attempting database operations.
            if (!authReady || !db) { // Check for db instance as well as authReady
                console.warn('loadRewardData: Authentication not ready or database instance missing. Cannot load data.');
                if (pointsDisplayTopRight) pointsDisplayTopRight.textContent = 'N/A';
                if (dailyRewardMessage) showMessage(dailyRewardMessage, 'Authentication/Database required for rewards. Please ensure Firebase is configured.', 'error');
                if (submitPhotoMessage) showMessage(submitPhotoMessage, 'Authentication/Database required for photo submission.', 'error');
                if (photoRewardMessage) showMessage(photoRewardMessage, 'Authentication/Database required for photo rewards.', 'error');
                return;
            }
            if (!userId) { // Separate check for userId
                 console.warn('loadRewardData: User ID is missing. Cannot load data.');
                 if (pointsDisplayTopRight) pointsDisplayTopRight.textContent = 'N/A';
                 if (dailyRewardMessage) showMessage(dailyRewardMessage, 'User ID is missing. Cannot load rewards.', 'error');
                 return;
            }
            console.log(`loadRewardData: Attempting to load data for user: ${userId}`);

            // Reference to the user's specific rewards document in Firestore.
            // Path: /artifacts/{appId}/users/{userId}/rewards/daily
            const rewardsDocRef = doc(db, 'artifacts', appId, 'users', userId, 'rewards', 'daily');

            // Set up a real-time listener using onSnapshot.
            // This function will be called initially with the current data,
            // and then again every time the data in this document changes.
            onSnapshot(rewardsDocRef, (docSnap) => {
                if (docSnap.exists()) {
                    // If the document exists, get the data and update local state.
                    const data = docSnap.data();
                    points = data.points || 0;
                    lastDailyClaimedDate = data.lastDailyClaimedDate ? new Date(data.lastDailyClaimedDate) : null;
                    lastPhotoEarnDate = data.lastPhotoEarnDate ? new Date(data.lastPhotoEarnDate) : null;
                    photoSubmittedDate = data.photoSubmittedDate ? new Date(data.photoSubmittedDate) : null;

                    if (pointsDisplayTopRight) pointsDisplayTopRight.textContent = points; // Update top-right points display
                    console.log("loadRewardData: Data loaded and updated.", { points, lastDailyClaimedDate, lastPhotoEarnDate, photoSubmittedDate });
                } else {
                    // If the document doesn't exist (first-time user), initialize local state.
                    points = 0;
                    lastDailyClaimedDate = null;
                    lastPhotoEarnDate = null;
                    photoSubmittedDate = null;
                    if (pointsDisplayTopRight) pointsDisplayTopRight.textContent = points; // Update top-right points display
                    if (dailyRewardMessage) showMessage(dailyRewardMessage, 'Welcome! No daily reward claimed yet. Your progress will be saved.', 'info');
                    if (submitPhotoMessage) showMessage(submitPhotoMessage, 'No photo submitted yet.', 'info');
                    if (photoRewardMessage) showMessage(photoRewardMessage, 'No photo points claimed yet.', 'info');
                    console.log("loadRewardData: No existing data found for user. Initializing local state.");
                }
                // Always update the displayed User ID.
                if (emailUserIdDisplay) emailUserIdDisplay.textContent = userId;

                // After data is loaded/initialized, update button states based on cooldowns.
                checkDailyClaimButtonState();
                checkPhotoSubmissionAndClaimState();
            }, (error) => {
                console.error("Error fetching reward data (onSnapshot listener failed):", error);
                if (dailyRewardMessage) showMessage(dailyRewardMessage, 'Error loading daily reward data. Check console for details.', 'error');
                if (submitPhotoMessage) showMessage(submitPhotoMessage, 'Error loading photo submission data. Check console for details.', 'error');
                if (photoRewardMessage) showMessage(photoRewardMessage, 'Error loading photo reward data. Check console for details.', 'error');
            });
        }

        // --- Daily Reward Logic ---
        /**
         * Checks the state of the daily claim button and updates its text and disabled status.
         */
        function checkDailyClaimButtonState() {
            const now = new Date();
            // Calculate the next time the reward can be claimed.
            // If never claimed, it's available now (epoch 0).
            const nextClaimTime = lastDailyClaimedDate ? new Date(lastDailyClaimedDate.getTime() + DAILY_REWARD_COOLDOWN_MS) : new Date(0);

            if (now < nextClaimTime) {
                // If still on cooldown
                if (claimDailyRewardButton) claimDailyRewardButton.disabled = true;
                const timeUntilNextClaim = nextClaimTime.getTime() - now.getTime();
                if (claimDailyButtonText) claimDailyButtonText.textContent = `Next claim in ${formatTimeRemaining(timeUntilNextClaim)}`;
                if (dailyRewardMessage) showMessage(dailyRewardMessage, `You can claim your next daily reward in ${formatTimeRemaining(timeUntilNextClaim)}.`, 'info');
            } else {
                // If cooldown is over
                if (claimDailyRewardButton) claimDailyRewardButton.disabled = false;
                if (claimDailyButtonText) claimDailyButtonText.textContent = 'Claim Daily Reward (10 Points)';
                if (dailyRewardMessage) hideMessage(dailyRewardMessage);
            }
        }

        // Event listener for claiming daily reward
        if (claimDailyRewardButton) {
            claimDailyRewardButton.addEventListener('click', async () => {
                // Pre-checks for authentication and database availability
                if (!currentUserId || !db) {
                    if (dailyRewardMessage) showMessage(dailyRewardMessage, 'Website not ready. Please wait or check authentication.', 'error');
                    return;
                }

                // Disable button and show spinner during claim process
                if (claimDailyRewardButton) claimDailyRewardButton.disabled = true;
                if (claimDailyButtonText) claimDailyButtonText.classList.add('hidden');
                if (claimDailyLoadingSpinner) claimDailyLoadingSpinner.classList.remove('hidden');
                if (dailyRewardMessage) hideMessage(dailyRewardMessage);

                const now = new Date();
                const rewardsDocRef = doc(db, 'artifacts', appId, 'users', currentUserId, 'rewards', 'daily');
                const pointsToAdd = 10;

                try {
                    // Get current points to ensure we add to the latest value
                    const docSnap = await getDoc(rewardsDocRef);
                    let currentPoints = 0;
                    if (docSnap.exists()) {
                        currentPoints = docSnap.data().points || 0;
                    }

                    // Update points and last claimed date in Firestore
                    await setDoc(rewardsDocRef, {
                        points: currentPoints + pointsToAdd,
                        lastDailyClaimedDate: now.toISOString() // Store as ISO string for consistent date parsing
                    }, { merge: true }); // Use merge to only update specified fields

                    if (dailyRewardMessage) showMessage(dailyRewardMessage, `Successfully claimed ${pointsToAdd} daily points!`, 'success');
                    console.log(`Claimed ${pointsToAdd} daily points. New total: ${currentPoints + pointsToAdd}`);
                } catch (error) {
                    console.error("Error claiming daily reward:", error);
                    if (dailyRewardMessage) showMessage(dailyRewardMessage, `Failed to claim daily reward: ${error.message}.`, 'error');
                } finally {
                    // Re-enable button and hide spinner regardless of success/failure
                    if (claimDailyRewardButton) claimDailyRewardButton.disabled = false;
                    if (claimDailyButtonText) claimDailyButtonText.classList.remove('hidden');
                    if (claimDailyLoadingSpinner) claimDailyLoadingSpinner.classList.add('hidden');
                    checkDailyClaimButtonState(); // Update button state immediately
                }
            });
        }

        // --- Photo Submission & Claim Logic ---
        const MAX_FILE_SIZE_BYTES = 500 * 1024; // 500KB limit for Base64 storage storage in Firestore

        // Handle file selection: enable submit button when a valid file is chosen
        if (photoInput) {
            photoInput.addEventListener('change', () => {
                if (photoInput.files.length > 0) {
                    const file = photoInput.files[0];
                    if (file.size > MAX_FILE_SIZE_BYTES) {
                        if (submitPhotoMessage) showMessage(submitPhotoMessage, `File is too large (${(file.size / 1024).toFixed(1)}KB). Max size: ${MAX_FILE_SIZE_BYTES / 1024}KB.`, 'error');
                        if (submitPhotoButton) submitPhotoButton.disabled = true;
                        if (submitPhotoButtonText) submitPhotoButtonText.textContent = 'File Too Large';
                    } else {
                        if (submitPhotoButton) submitPhotoButton.disabled = false;
                        if (submitPhotoButtonText) submitPhotoButtonText.textContent = `Submit Photo: ${file.name}`;
                        if (submitPhotoMessage) hideMessage(submitPhotoMessage);
                    }
                } else {
                    // No file selected
                    if (submitPhotoButton) submitPhotoButton.disabled = true;
                    if (submitPhotoButtonText) submitPhotoButtonText.textContent = 'Select Photo to Enable Submit';
                    if (submitPhotoMessage) showMessage(submitPhotoMessage, 'Please select a photo to submit.', 'info');
                }
                checkPhotoSubmissionAndClaimState(); // Update photo submission/claim button states
            });
        }

        // Handle photo submission
        if (submitPhotoButton) {
            submitPhotoButton.addEventListener('click', async () => {
                // Pre-checks
                if (!currentUserId || !db) {
                    if (submitPhotoMessage) showMessage(submitPhotoMessage, 'Website not ready. Please wait or check authentication.', 'error');
                    return;
                }
                if (photoInput && (photoInput.files.length === 0 || submitPhotoButton.disabled)) {
                    if (submitPhotoMessage) showMessage(submitPhotoMessage, 'Please select a valid photo before submitting.', 'warning');
                    return;
                }

                // Disable button and show spinner during submission
                if (submitPhotoButton) submitPhotoButton.disabled = true;
                if (submitPhotoButtonText) submitPhotoButtonText.classList.add('hidden');
                if (submitPhotoLoadingSpinner) submitPhotoLoadingSpinner.classList.remove('hidden');
                if (submitPhotoMessage) hideMessage(submitPhotoMessage);

                const now = new Date();
                const rewardsDocRef = doc(db, 'artifacts', appId, 'users', currentUserId, 'rewards', 'daily');
                // Path for public gallery: /artifacts/{appId}/public/gallery/photos/{docId}
                const galleryCollectionRef = collection(db, 'artifacts', appId, 'public', 'gallery', 'photos');

                try {
                    const file = photoInput.files[0];
                    const reader = new FileReader();

                    reader.onload = async (e) => {
                        const imageDataUrl = e.target.result; // Base64 encoded image

                        // 1. Update user's private record for submission cooldown
                        await setDoc(rewardsDocRef, {
                            photoSubmittedDate: now.toISOString()
                        }, { merge: true });

                        // 2. Add photo metadata (including base64 image data) to public gallery collection
                        await addDoc(galleryCollectionRef, {
                            userId: currentUserId,
                            timestamp: now.toISOString(),
                            fileName: file.name,
                            imageUrl: imageDataUrl // Store the base64 data directly
                        });

                        if (submitPhotoMessage) showMessage(submitPhotoMessage, 'Photo successfully submitted to gallery! Redirecting...', 'success');
                        // Clear input and disable after submission
                        if (photoInput) {
                            photoInput.disabled = true;
                            photoInput.value = ''; 
                        }
                        checkPhotoSubmissionAndClaimState(); // Update button states
                        
                        // Redirect to gallery.html after successful submission
                        console.log("Photo submitted. Redirecting to gallery.html...");
                        window.location.href = 'gallery.html';
                    };
                    reader.readAsDataURL(file); // Read file as Data URL (Base64)

                } catch (error) {
                    console.error("Error submitting photo:", error);
                    if (submitPhotoMessage) showMessage(submitPhotoMessage, `Failed to submit photo: ${error.message}.`, 'error');
                } finally {
                    // Re-enable/hide UI elements
                    if (submitPhotoButton) submitPhotoButton.classList.remove('hidden');
                    if (submitPhotoButtonText) submitPhotoButtonText.classList.remove('hidden');
                    if (submitPhotoLoadingSpinner) submitPhotoLoadingSpinner.classList.add('hidden');
                }
            });
        }

        // Event listener for claiming photo reward
        if (claimPhotoRewardButton) {
            claimPhotoRewardButton.addEventListener('click', async () => {
                // Pre-checks
                if (!currentUserId || !db) {
                    if (photoRewardMessage) showMessage(photoRewardMessage, 'Website not ready. Please wait or check authentication.', 'error');
                    return;
                }

                // Disable button and show spinner
                if (claimPhotoRewardButton) claimPhotoRewardButton.disabled = true;
                if (claimPhotoButtonText) claimPhotoButtonText.classList.add('hidden');
                if (claimPhotoLoadingSpinner) claimPhotoLoadingSpinner.classList.remove('hidden');
                if (photoRewardMessage) hideMessage(photoRewardMessage);

                const now = new Date();
                const rewardsDocRef = doc(db, 'artifacts', appId, 'users', currentUserId, 'rewards', 'daily');
                const pointsToAdd = 50;

                try {
                    const docSnap = await getDoc(rewardsDocRef);
                    let currentPoints = 0;
                    if (docSnap.exists()) {
                        currentPoints = docSnap.data().points || 0;
                    }

                    // Get last submission/claim times for cooldown logic
                    const nextClaimEarnTime = lastPhotoEarnDate ? new Date(lastPhotoEarnDate.getTime() + PHOTO_CLAIM_COOLDOWN_MS) : new Date(0);
                    const nextSubmitTime = photoSubmittedDate ? new Date(photoSubmittedDate.getTime() + PHOTO_SUBMISSION_COOLDOWN_MS) : new Date(0);

                    // Logic to ensure a photo was submitted recently AND rewards haven't been claimed recently
                    if (!photoSubmittedDate || now >= nextSubmitTime) { // No recent submission (cooldown expired or never submitted)
                        throw new Error("No recent photo submission to claim rewards for. Please submit a new photo.");
                    }
                    if (now < nextClaimEarnTime) { // Already claimed recently
                        throw new Error(`Photo reward already claimed. Next claim in ${formatTimeRemaining(nextClaimEarnTime.getTime() - now.getTime())}.`);
                    }

                    await setDoc(rewardsDocRef, {
                        points: currentPoints + pointsToAdd,
                        lastPhotoEarnDate: now.toISOString()
                    }, { merge: true });

                    if (photoRewardMessage) showMessage(photoRewardMessage, `Successfully claimed ${pointsToAdd} photo points!`, 'success');
                    console.log(`Claimed ${pointsToAdd} photo points. New total: ${currentPoints + pointsToAdd}`);
                } catch (error) {
                    console.error("Error claiming photo reward:", error);
                    if (photoRewardMessage) showMessage(photoRewardMessage, `Failed to claim photo reward: ${error.message}.`, 'error');
                } finally {
                    // Re-enable/hide UI elements
                    if (claimPhotoRewardButton) claimPhotoRewardButton.disabled = false;
                    if (claimPhotoButtonText) claimPhotoButtonText.classList.remove('hidden');
                    if (claimPhotoLoadingSpinner) claimPhotoLoadingSpinner.classList.add('hidden');
                    checkPhotoSubmissionAndClaimState(); // Update button state immediately
                }
            });
        }


        function checkPhotoSubmissionAndClaimState() {
            const now = new Date();
            const nextSubmitTime = photoSubmittedDate ? new Date(photoSubmittedDate.getTime() + PHOTO_SUBMISSION_COOLDOWN_MS) : new Date(0);
            const nextClaimEarnTime = lastPhotoEarnDate ? new Date(lastPhotoEarnDate.getTime() + PHOTO_CLAIM_COOLDOWN_MS) : new Date(0);

            // --- Manage Submit Button State ---
            if (now < nextSubmitTime) {
                // Submission is on cooldown
                if (submitPhotoButton) submitPhotoButton.disabled = true;
                if (photoInput) photoInput.disabled = true; // Disable file input too
                const timeRemaining = nextSubmitTime.getTime() - now.getTime();
                if (submitPhotoButtonText) submitPhotoButtonText.textContent = `Already submitted today! Next submission in ${formatTimeRemaining(timeRemaining)}`;
                if (submitPhotoMessage) showMessage(submitPhotoMessage, `You've already submitted a photo today. Next submission in ${formatTimeRemaining(timeRemaining)}.`, 'info');
            } else {
                // Submission is available
                if (photoInput) photoInput.disabled = false;
                if (photoInput && photoInput.files.length === 0) {
                     // If no file selected
                     if (submitPhotoButton) submitPhotoButton.disabled = true;
                     if (submitPhotoButtonText) submitPhotoButtonText.textContent = 'Select Photo to Enable Submit';
                     if (submitPhotoMessage) showMessage(submitPhotoMessage, 'Please select a photo to submit.', 'info');
                } else if (photoInput && photoInput.files.length > 0 && photoInput.files[0].size > MAX_FILE_SIZE_BYTES) {
                     // If file selected but too large
                     if (submitPhotoButton) submitPhotoButton.disabled = true;
                     if (submitPhotoButtonText) submitPhotoButtonText.textContent = 'File Too Large';
                     if (submitPhotoMessage) showMessage(submitPhotoMessage, `File is too large (${(photoInput.files[0].size / 1024).toFixed(1)}KB). Max size: ${MAX_FILE_SIZE_BYTES / 1024}KB.`, 'error');
                }
                else {
                     // File selected and valid size
                     if (submitPhotoButton) submitPhotoButton.disabled = false;
                     if (submitPhotoButtonText) submitPhotoButtonText.textContent = `Submit Photo: ${photoInput && photoInput.files.length > 0 ? photoInput.files[0].name : ''}`;
                     if (submitPhotoMessage) hideMessage(submitPhotoMessage);
                }
            }

            // --- Manage Claim Button State ---
            let claimMessage = '';

            // Can only claim if a photo was submitted recently (based on photoSubmittedDate)
            // AND points haven't been claimed for a photo recently (based on lastPhotoEarnDate)
            if (!photoSubmittedDate || now >= nextSubmitTime) { // If no recent submission or submission cooldown is over
                claimMessage = 'Submit a photo above to enable claiming.';
                if (claimPhotoRewardButton) claimPhotoRewardButton.disabled = true;
                if (photoRewardMessage) showMessage(photoRewardMessage, 'Submit a photo to unlock your daily points.', 'info');
            } else if (now < nextClaimEarnTime) { // If submitted, but claim cooldown is active
                const timeUntilNextClaim = nextClaimEarnTime.getTime() - now.getTime();
                claimMessage = `Already Claimed. Next claim in ${formatTimeRemaining(timeUntilNextClaim)}`;
                if (claimPhotoRewardButton) claimPhotoRewardButton.disabled = true;
                if (photoRewardMessage) showMessage(photoRewardMessage, `You've already claimed points for a photo today. Next claim in ${formatTimeRemaining(timeUntilNextClaim)}.`, 'info');
            } else { // Photo submitted recently and claim cooldown is over
                claimMessage = 'Claim Photo Rewards (Earn 50 Points)';
                if (claimPhotoRewardButton) claimPhotoRewardButton.disabled = false;
                if (photoRewardMessage) hideMessage(photoRewardMessage);
            }

            if (claimPhotoButtonText) claimPhotoButtonText.textContent = claimMessage;
        }

        // Initialize button states and timers every second for real-time updates
        setInterval(() => {
            checkDailyClaimButtonState();
            checkPhotoSubmissionAndClaimState();
        }, 1000); // Check every second for rapid updates

        // The loading overlay was removed, so no explicit hideLoading call here.
        // The display of the main content (`homePage`) is now managed by `onAuthStateChanged`.

    } catch (initialScriptError) {
        // This catch block handles any synchronous errors that occur during the initial loading/parsing
        // of the script itself, or synchronous errors during variable declarations/Firebase initialization
        // BEFORE the DOMContentLoaded listener even finishes executing.
        showCriticalError(`Critical Script Error during DOMContentLoaded listener setup: ${initialScriptError.message}. Check browser console for more details.`);
    }
}); // End DOMContentLoaded listener
