const { CognitoJwtVerifier } = require('aws-jwt-verify');

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  tokenUse: 'id', // Verify ID tokens (not access tokens)
  clientId: process.env.COGNITO_CLIENT_ID
});

module.exports = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(403).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(403).json({ message: 'Invalid token format' });
  }

  try {
    const payload = await verifier.verify(token);
    req.user = { username: payload['cognito:username'] };
    next();
  } catch (err) {
    console.error('Token verification error:', err);
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};