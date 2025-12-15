// Debug script to check chrome.storage.local
// Open extension popup, then open DevTools console and paste this:

chrome.storage.local.get(null, (result) => {
    console.log('=== ALL STORAGE ===');
    console.log(JSON.stringify(result, null, 2));

    console.log('\n=== AUTH STORAGE ===');
    if (result.analygits_auth) {
        console.log('Found analygits_auth:', result.analygits_auth);
        console.log('Has deviceToken?', !!result.analygits_auth.deviceToken);
    } else {
        console.log('No analygits_auth found');
    }
});
