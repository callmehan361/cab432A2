const { CognitoJwtVerifier } = require('aws-jwt-verify');

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  tokenUse: 'id', // Verify idToken (not accessToken)
  clientId: process.env.COGNITO_CLIENT_ID
});

module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No or invalid Authorization header' });
    }
    const token = authHeader.split(' ')[1]; // Extract token after 'Bearer '
    console.log('Verifying JWT for user:', token); // Debug log
    const payload = await verifier.verify(token);
    req.user = payload; // Attach user data to request
    next();
  } catch (err) {
    console.error('JWT verification error:', err);
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};