'use client'

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AutoDismissMessageQueue from '@/components/AutoDismissMessageQueue';

export default function Home() {
  const [email, setEmail] = useState('test@freewayvpn.top');
  const [password, setPassword] = useState('test');
  const [isLogin, setIsLogin] = useState(true); // Controls whether it's login or register mode

  const messageRef = useRef();

  const router = useRouter();

  const server = 'http://146.235.210.34';

  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  let versionSupported = true; // Assume version is supported by default

  const handleCheckVersion = () => {
    // Check the version of the app
    fetch(`${server}:8001/version?client-version=0.1.0`, {
      method: 'GET',
      headers: {
      'Content-Type': 'application/json',
      },
    })
      .then((res) => {
        if (res.ok) {
          // handleSuccess('Version check successful.');
        } else {
          versionSupported = false; // Set to false if the version is not supported
          handleError('Version is not supported. Please update the app.');
        }
      })
      .catch((err) => {
        handleError('Error checking version.');
        versionSupported = false;
      });
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isLogin) {
      handleLogin();
    } else {
      handleRegister();
    }
  };

  function handleLogin() {
    // Send a POST request to the server, and get the jwt token in the response body
    let loginURL = `${server}:8001/login`;
    fetch(loginURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ "Email": email, "Password": password }),
    })
      .then((res) => res.json())
      .then((data) => {
        const token = data.token;
        
        if (token) {
          console.log('JWT Token:', token);

          localStorage.setItem('token', token);

          // Redirect to the main page
          router.push('/main');
        } else {
          console.error('No token found in response');
        }
      })
      .catch((err) => {
        console.error('Error during login:', err);
        messageRef.current?.addMessage('Login failed. Please check your credentials.', 'error');
      });
  }

  function handleRegister() {
    let registerURL = `${server}:8001/signup`;
    fetch(registerURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ "Email": email, "Password": password }),
    })
      .then(async (res) => {
        const text = await res.text();
        if (!res.ok) {
          throw new Error(text || 'Registration failed');
        }
        console.log('Registered with:', { "Email": email, "Password": password });
        messageRef.current?.addMessage('Registration successful! Please login.', 'success');
        setIsLogin(true); // Switch to login mode after successful registration
      })
      .catch((err) => {
        console.error('Error:', err);
        messageRef.current?.addMessage('Registration failed. Please try again.', 'error');
      });
  }

  useEffect(() => {
    handleCheckVersion();
    //handleLogin();
  }, []);

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gray-50">
      <div className="w-full max-w-[350px] mx-auto p-6 border border-gray-300 rounded-lg bg-white shadow-md">
        <form onSubmit={handleSubmit} className="max-w-[275px] mx-auto">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700">Email:</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 max-w-[275px]"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700">Password:</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 max-w-[275px]"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 max-w-[275px]"
            disabled={versionSupported === false}
          >
            {isLogin ? 'Login' : 'Register'}
          </button>
        </form>
        <div className="text-center mt-4">
          <p className="text-sm text-gray-600">
            {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
            <a
              href="#"
              onClick={() => setIsLogin(!isLogin)}
              className="text-blue-600 hover:underline"
            >
              {isLogin ? 'Register' : 'Login'}
            </a>
          </p>
        </div>
      </div>

      <AutoDismissMessageQueue ref={messageRef} />
    </div>

  );
}