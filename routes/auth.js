/*
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
    console.log(idToken)
  } catch (err) {
    console.error('Cognito login error:', err);
    res.status(401).json({ message: err.message || 'Login failed' });
  }
});

module.exports = router;
*/




/*
const express = require('express');
const { 
  CognitoIdentityProviderClient, 
  SignUpCommand, 
  ConfirmSignUpCommand, 
  InitiateAuthCommand
} = require('@aws-sdk/client-cognito-identity-provider');

const crypto = require('crypto');
const router = express.Router();

// Configure Cognito client
const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION
});

// Utility to generate secret hash
function generateSecretHash(username) {
  if (!process.env.COGNITO_CLIENT_SECRET) return undefined;
  return crypto.createHmac('sha256', process.env.COGNITO_CLIENT_SECRET)
    .update(username + process.env.COGNITO_CLIENT_ID)
    .digest('base64');
}

// REGISTER
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Username, email, and password are required' });
  }
  try {
    console.log(`Registering user ${username} with email ${email}`);
    await cognitoClient.send(new SignUpCommand({
      ClientId: process.env.COGNITO_CLIENT_ID,
      SecretHash: generateSecretHash(username),
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

// CONFIRM
router.post('/confirm', async (req, res) => {
  const { username, code } = req.body;
  if (!username || !code) {
    return res.status(400).json({ message: 'Username and confirmation code are required' });
  }
  try {
    console.log(`Confirming email for user ${username}`);
    await cognitoClient.send(new ConfirmSignUpCommand({
      ClientId: process.env.COGNITO_CLIENT_ID,
      SecretHash: generateSecretHash(username),
      Username: username,
      ConfirmationCode: code
    }));
    res.json({ message: 'Email confirmed successfully' });
  } catch (err) {
    console.error('Cognito confirm error:', err);
    res.status(500).json({ message: err.message || 'Confirmation failed' });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }
  try {
    console.log(`Logging in user ${username}`);
    const result = await cognitoClient.send(new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: process.env.COGNITO_CLIENT_ID,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
        SECRET_HASH: generateSecretHash(username)
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
*/



const express = require('express');
const { CognitoIdentityProviderClient, SignUpCommand, ConfirmSignUpCommand, InitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { CognitoJwtVerifier } = require('aws-jwt-verify');
const crypto = require('crypto');

const router = express.Router();

// Configuration (replace with your values from AWS Console)
const clientId = '1jhh3ii265m4l4cuvh98vd744n'; // Your Cognito App Client ID
const clientSecret = '1lj1pnnm7p718qbr48kd4ehksp5f9jps6u381p7b6ok6k6vrrsua'; // Your Cognito App Client Secret
const userPoolId = 'ap-southeast-2_2ovFsHYzd'; // Your Cognito User Pool ID
const region = 'ap-southeast-2';

// Initialize Cognito client
const client = new CognitoIdentityProviderClient({ region });

// Secret hash function
function secretHash(clientId, clientSecret, username) {
  const hasher = crypto.createHmac('sha256', clientSecret);
  hasher.update(`${username}${clientId}`);
  return hasher.digest('base64');
}

// JWT verifier
const idVerifier = CognitoJwtVerifier.create({
  userPoolId,
  tokenUse: 'id',
  clientId,
});

// Register user
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  console.log('Register request:', { username, email });

  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Username, email, and password are required' });
  }

  try {
    const command = new SignUpCommand({
      ClientId: clientId,
      SecretHash: secretHash(clientId, clientSecret, username),
      Username: username,
      Password: password,
      UserAttributes: [{ Name: 'email', Value: email }],
    });
    const response = await client.send(command);
    console.log('Register response:', response);
    res.json({ message: 'User registered, confirmation code sent to email' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Registration failed', error: err.message });
  }
});

// Confirm user
router.post('/confirm', async (req, res) => {
  const { username, code } = req.body;
  console.log('Confirm request:', { username, code });

  if (!username || !code) {
    return res.status(400).json({ message: 'Username and confirmation code are required' });
  }

  try {
    const command = new ConfirmSignUpCommand({
      ClientId: clientId,
      SecretHash: secretHash(clientId, clientSecret, username),
      Username: username,
      ConfirmationCode: code,
    });
    const response = await client.send(command);
    console.log('Confirm response:', response);
    res.json({ message: 'Email confirmed successfully' });
  } catch (err) {
    console.error('Confirm error:', err);
    res.status(500).json({ message: 'Confirmation failed', error: err.message });
  }
});

// Login user
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  console.log('Login request:', { username });

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    const command = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
        SECRET_HASH: secretHash(clientId, clientSecret, username),
      },
      ClientId: clientId,
    });
    const response = await client.send(command);
    console.log('Login response:', response);
    const idToken = response.AuthenticationResult.IdToken;
    const verifyResult = await idVerifier.verify(idToken);
    console.log('ID token verification:', verifyResult);
    res.json({
      message: 'Login successful',
      idToken,
      accessToken: response.AuthenticationResult.AccessToken,
      refreshToken: response.AuthenticationResult.RefreshToken,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
});

// Middleware to verify JWT
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log('Auth header:', authHeader);
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = await idVerifier.verify(token);
    console.log('JWT verified:', payload);
    req.user = { username: payload['cognito:username'] };
    next();
  } catch (err) {
    console.error('JWT verification error:', err);
    res.status(401).json({ message: 'Invalid token' });
  }
};

module.exports = { router, authMiddleware };
