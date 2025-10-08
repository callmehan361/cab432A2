const express = require('express');
const AWS = require('aws-sdk');
const { AuthenticationDetails, CognitoUser, CognitoUserPool } = require('amazon-cognito-identity-js');

const router = express.Router();

// Configure Cognito
const userPool = new CognitoUserPool({
  UserPoolId: process.env.COGNITO_USER_POOL_ID,
  ClientId: process.env.COGNITO_CLIENT_ID
});

// Register user
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Username, email, and password are required' });
  }

  const attributeList = [
    new AWS.CognitoIdentityServiceProvider.CognitoUserAttribute({
      Name: 'email',
      Value: email
    })
  ];

  try {
    console.log(`Registering user ${username} with email ${email}`);
    await new Promise((resolve, reject) => {
      userPool.signUp(username, password, attributeList, null, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
    res.json({ message: 'User registered, confirmation code sent to email' });
  } catch (err) {
    console.error('Cognito register error:', err);
    res.status(500).json({ message: err.message || 'Registration failed' });
  }
});

// Confirm email
router.post('/confirm', async (req, res) => {
  const { username, code } = req.body;
  if (!username || !code) {
    return res.status(400).json({ message: 'Username and confirmation code are required' });
  }

  const cognitoUser = new CognitoUser({
    Username: username,
    Pool: userPool
  });

  try {
    console.log(`Confirming email for user ${username}`);
    await new Promise((resolve, reject) => {
      cognitoUser.confirmRegistration(code, true, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
    res.json({ message: 'Email confirmed successfully' });
  } catch (err) {
    console.error('Cognito confirm error:', err);
    res.status(500).json({ message: err.message || 'Confirmation failed' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  const authenticationDetails = new AuthenticationDetails({
    Username: username,
    Password: password
  });
  const cognitoUser = new CognitoUser({
    Username: username,
    Pool: userPool
  });

  try {
    console.log(`Logging in user ${username}`);
    const result = await new Promise((resolve, reject) => {
      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: (session) => resolve(session),
        onFailure: (err) => reject(err)
      });
    });
    res.json({
      message: 'Login successful',
      idToken: result.getIdToken().getJwtToken(),
      accessToken: result.getAccessToken().getJwtToken(),
      refreshToken: result.getRefreshToken().getToken()
    });
  } catch (err) {
    console.error('Cognito login error:', err);
    res.status(401).json({ message: err.message || 'Login failed' });
  }
});

module.exports = router;