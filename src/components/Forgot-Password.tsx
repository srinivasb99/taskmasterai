import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, Mail, ArrowLeft } from 'lucide-react';
import { sendPasswordResetEmail } from '../lib/login-firebase';

function ForgotPassword() {
  const { loading } = useAuth();
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      await sendPasswordResetEmail(email);
      setIsSubmitted(true);
    } catch (error) {
      console.error("Password reset failed", error);
      setError('Failed to send reset email. Please check your email address and try again.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 font-poppins">
      <main className="flex items-center justify-center min-h-screen">
        <div className="w-full max-w-md bg-gray-800 p-8 rounded-xl">
          {/* Back to Login Link */}
          <a 
            href="/login" 
            className="inline-flex items-center text-indigo-400 hover:text-indigo-300 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Login
          </a>

          <h2 className="text-3xl text-center text-white mb-6">Reset Password</h2>
          
          {!isSubmitted ? (
            <>
              <p className="text-center text-gray-400 mb-6">
                Enter your email address and we'll send you instructions to reset your password.
              </p>

              <form onSubmit={handleSubmit}>
                <div className="mb-6">
                  <label htmlFor="email" className="text-gray-300">Email</label>
                  <div className="mt-2 relative">
                    <input
                      type="email"
                      id="email"
                      className="w-full p-3 pl-10 rounded-lg bg-gray-700 text-white"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                    <Mail className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                  </div>
                </div>

                {error && (
                  <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/50 text-red-500 text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full hover:scale-105 transition-all flex items-center justify-center"
                >
                  Send Reset Instructions
                </button>
              </form>
            </>
          ) : (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-green-500" />
              </div>
              <h3 className="text-xl text-white mb-2">Check your email</h3>
              <p className="text-gray-400 mb-6">
                We've sent password reset instructions to {email}
              </p>
              <button
                onClick={() => window.location.href = '/login'}
                className="text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Back to Login
              </button>
            </div>
          )}

          {/* Terms of Service Link */}
          <div className="text-center mt-8 text-sm text-gray-400">
            By continuing, you agree to our{' '}
            <a href="/terms" className="text-indigo-400 hover:underline">Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy-policy" className="text-indigo-400 hover:underline">Privacy Policy</a>.
          </div>
        </div>
      </main>
    </div>
  );
}

export default ForgotPassword;
