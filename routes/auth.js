const express = require('express');
const { CognitoUserPool, CognitoUser, AuthenticationDetails } = require('amazon-cognito-identity-js');
const router = express.Router();

const poolData = {
  UserPoolId: process.env.COGNITO_USER_POOL_ID,
  ClientId: process.env.COGNITO_CLIENT_ID
};
const userPool = new CognitoUserPool(poolData);

// Register user
router.post('/register', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Username, email, and password are required' });
  }

  userPool.signUp(username, password, [{ Name: 'email', Value: email }], null, (err, result) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }
    res.json({ message: 'User registered, please verify email', username });
  });
});

// Confirm registration
router.post('/confirm', (req, res) => {
  const { username, code } = req.body;
  if (!username || !code) {
    return res.status(400).json({ message: 'Username and verification code are required' });
  }

  const cognitoUser = new CognitoUser({ Username: username, Pool: userPool });
  cognitoUser.confirmRegistration(code, true, (err, result) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }
    res.json({ message: 'Email verified successfully' });
  });
});

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  const authenticationDetails = new AuthenticationDetails({
    Username: username,
    Password: password
  });
  const cognitoUser = new CognitoUser({ Username: username, Pool: userPool });
  cognitoUser.authenticateUser(authenticationDetails, {
    onSuccess: (result) => {
      const token = result.getIdToken().getJwtToken();
      res.json({ token });
    },
    onFailure: (err) => {
      res.status(400).json({ message: err.message });
    }
  });
});

module.exports = router;