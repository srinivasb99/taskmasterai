import React from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { SignUpForm } from './sign-up/SignUpForm';
import { GoogleSignUp } from './sign-up/GoogleSignUp';

export function SignUp() {
  const { loading } = useAuth();

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
          <h2 className="text-3xl text-center text-white mb-6">Create Account</h2>
          <p className="text-center text-gray-400 mb-6">
            Join thousands of professionals using TaskMaster AI
          </p>

          <GoogleSignUp />

          <div className="flex items-center my-6">
            <hr className="flex-grow border-t border-gray-600" />
            <span className="mx-2 text-gray-400">OR</span>
            <hr className="flex-grow border-t border-gray-600" />
          </div>

          <SignUpForm />

          <div className="text-center mt-6">
            <p className="text-sm text-gray-400">
              Already have an account?{' '}
              <a href="/login" className="text-indigo-400 hover:underline">
                Login
              </a>
            </p>
          </div>

          <div className="text-center mt-4 text-sm text-gray-400">
            By signing up, you agree to our{' '}
            <a href="/terms" className="text-indigo-400 hover:underline">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="/privacy-policy" className="text-indigo-400 hover:underline">
              Privacy Policy
            </a>
            .
          </div>
        </div>
      </main>
    </div>
  );
}
