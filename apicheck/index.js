const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const https = require('https');
const notifier = require('node-notifier');
const CHECK_INTERVAL = 5000;
let apiIsDown = false; // Variable to track API status

async function checkApiStatus() {
  const agent = new https.Agent({  
    rejectUnauthorized: false
  });

  try {
    const response = await fetch('https://localhost:7289/api/VerifyAPI/Check', { agent });

    if (!response.ok) {
      throw new Error('API is down');
    }

    if (apiIsDown) {
      // If the API was down previously and now it's back up, notify the user.
      showNotification('API Status', 'Your Web API is back online.');
      apiIsDown = false; // Update status to reflect the API is back up
    } else {
      console.log('API is up and running');
    }
  } catch (error) {
    console.error('Failed to reach the API:', error.message);
    if (!apiIsDown) {
      // Notify only if this is the first time we realize the API is down
      showNotification('API Status', 'Your Web API is not responding.');
      apiIsWarningFlag = false;
      apiIsDown = true; // Update status to reflect the API is down
    }
  }
}

function showNotification(title, body) { // Function to show notification
  notifier.notify({
    title: title,
    message: body,
    sound: true,
    wait: true
  });
}

setInterval(checkApiStatus, CHECK_INTERVAL);
checkApiStatus();