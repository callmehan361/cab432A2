const express = require('express');
const { CognitoIdentityProviderClient, SignUpCommand, ConfirmSignUpCommand, InitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider');

const crypto = require('crypto');
const router = express.Router();

// Configure Cognito client
const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION
});

// Register user
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Username, email, and password are required' });
  }

  try {
    console.log(`Registering user ${username} with email ${email}`);
    await cognitoClient.send(new SignUpCommand({
      ClientId: process.env.COGNITO_CLIENT_ID,
      SecretHash: process.env.COGNITO_CLIENT_SECRET ? require('crypto').createHmac('sha256', process.env.COGNITO_CLIENT_SECRET).update(username + process.env.COGNITO_CLIENT_ID).digest('base64') : undefined,
      Username: username,
      Password: password,
      UserAttributes: [{ Name: 'email', Value: email }]
    }));
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

  try {
    console.log(`Confirming email for user ${username}`);
    await cognitoClient.send(new ConfirmSignUpCommand({
      ClientId: process.env.COGNITO_CLIENT_ID,
      SecretHash: process.env.COGNITO_CLIENT_SECRET ? require('crypto').createHmac('sha256', process.env.COGNITO_CLIENT_SECRET).update(username + process.env.COGNITO_CLIENT_ID).digest('base64') : undefined,
      Username: username,
      ConfirmationCode: code
    }));
    res.json({ message: 'Email confirmed successfully' });
  } catch (err) {
    console.error('Cognito confirm error:', err);
    res.status(500).json({ message: err.message || 'Confirmation failed' });
  }
});

const clientSecret = "1lj1pnnm7p718qbr48kd4ehksp5f9jps6u381p7b6ok6k6vrrsua";
const clientId = "1jhh3ii265m4l4cuvh98vd744n";

function SecretHash(clientId, clientSecret, username){
  const hasher = crypto.createHmac('SHA256', clientSecret);
  hasher.update('${username}${clientId}');
  return hasher.digest('base64');
}

// Login user
router.post('/login', async (req, res) => {
  console.log('started 1');
  const { username, password } = req.body;
  console.log('started 2');
  if (!username || !password) {
    console.log('started 3');
    return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    console.log(`Logging in user ${username}`);
    console.log(process.env.COGNITO_CLIENT_SECRET);
    const result = await cognitoClient.send(new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: process.env.COGNITO_CLIENT_ID,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
        SECRET_HASH: process.env.COGNITO_CLIENT_SECRET ? require('crypto').createHmac('sha256', process.env.COGNITO_CLIENT_SECRET).update(username + process.env.COGNITO_CLIENT_ID).digest('base64') : undefined
        //SecretHash: SecretHash(process.env.COGNITO_CLIENT_ID, process.env.COGNITO_CLIENT_SECRET, username)
      }
    }));
    
    res.json({
      message: 'Login successful',
      idToken: result.AuthenticationResult.IdToken,
      accessToken: result.AuthenticationResult.AccessToken,
      refreshToken: result.AuthenticationResult.RefreshToken
    });
  } catch (err) {
    console.error('Cognito login error:', err);
    res.status(401).json({ message: err.message || 'Login failed' });
  }
});

module.exports = router;