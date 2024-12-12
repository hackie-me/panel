// Import required modules
const express = require('express');
const CryptoJS = require('crypto-js');

// Create an instance of Express
const app = express();
const port = 8523; // Replace with your desired port number

// Middleware to parse JSON bodies
app.use(express.json());

// Endpoint for encryption
app.post('/api/encrypt', (req, res) => {
    try {
        // Get parameters from request body
        const { ip, password, Key } = req.body;

        // Concatenate password and ip with a backtick
        const value = `${password}\`${ip}`;


        // Function to handle AES encryption similar to CryptoJS
        function encryptUsingRandomKey(value, userKey) {
            const keys = "OMS1@2020#^@El@K";
            const key1 = keys.substr(0, keys.length - 2)  + userKey;

            const _key = CryptoJS.enc.Utf8.parse(key1);
            const _iv = CryptoJS.enc.Utf8.parse(key1);
            if (value != null && value != "") {
                const encrypted = CryptoJS.AES.encrypt(
                    JSON.stringify(value), _key, {
                        keySize: 16,
                        iv: _iv,
                        mode: CryptoJS.mode.ECB,
                        padding: CryptoJS.pad.Pkcs7
                    });
                return encrypted.toString();
            } else {
                return "";
            }
        }

        // Encrypt the value using CryptoJS
        const encryptedValue = encryptUsingRandomKey(value, Key);

        // Return the encrypted value as JSON
        res.json({ encrypted: encryptedValue, old: req.body});
    } catch (error) {
        console.error('Encryption failed:', error);
        res.status(500).json({ error: 'Encryption failed. Please check parameters.' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
