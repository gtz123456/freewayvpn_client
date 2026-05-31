'use client'

import '@/app/i18n'
import i18next from 'i18next';
import { I18nContext } from '@/app/i18n';

import { invoke } from '@tauri-apps/api/core';
import { fetch } from '@tauri-apps/plugin-http';

import { useState, useEffect, useRef, useContext } from 'react';
import { useRouter } from 'next/navigation';
import AutoDismissMessageQueue from '@/components/AutoDismissMessageQueue';

export default function Home() {
  const { setLanguage } = useContext(I18nContext);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [isLogin, setIsLogin] = useState(true); // Controls whether it's login or register mode

  const messageRef = useRef();

  const router = useRouter();

  const server = 'http://170.9.29.245';

  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  let versionSupported = true; // Assume version is supported by default

  const handleCheckVersion = () => {
    // Check the version of the app
    fetch(`${server}:8080/version?client-version=0.1.0`, {
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
          messageRef.current?.addMessage(i18next.t('Version not supported'), 'error');
          console.error('Version not supported');
        }
      })
      .catch((err) => {
        messageRef.current?.addMessage(i18next.t('Error checking version'), 'error');
        versionSupported = false;
      });
  }

  const handleSubmit = (e) => {
    e.preventDefault();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      messageRef.current?.addMessage(i18next.t('Invalid email format'), 'error');
      return;
    }

    if (password.length < 6) {
      messageRef.current?.addMessage(i18next.t('Password must be at least 6 characters'), 'error');
      return;
    }

    if (isLogin) {
      handleLogin();
    } else {
      handleRegister();
    }
  };

  function handleLogin() {
    // Send a POST request to the server, and get the jwt token in the response body
    let loginURL = `${server}:8080/login`;
    fetch(loginURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ "Email": email, "Password": password }),
    })
      .then((res) => res.json())
      .then((data) => {        
        if (data.token) {
          console.log('JWT Token:', data.token);
          localStorage.setItem('token', data.token);
          localStorage.setItem('auth_email', email);
          localStorage.setItem('auth_password', password);
          router.push('/main');
        } else {
          console.error('Login failed:', data.error || 'No token found');
          messageRef.current?.addMessage(i18next.t('Login failed') + ' ' + (data.error || 'No token found'), 'error');
        }
      })
      .catch((err) => {
        console.error('Error during login:', err);
        messageRef.current?.addMessage(i18next.t('Login failed') + ' ' + err.message, 'error');
      });
  }

  function handleRegister() {
    let registerURL = `${server}:8080/signup`;
    fetch(registerURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ "Email": email, "Password": password, "referral_code": referralCode }),
    })
      .then((res) => {
        if (res.ok) {
          messageRef.current?.addMessage(i18next.t('Registration successful'), 'success');
          setIsLogin(true); // Switch to login mode after successful registration
        } else {
          return res.json().then((data) => {
            throw new Error(data.error || 'Registration failed');
          });
        }
      })
      .catch((err) => {
        console.error('Error during registration:', err);
        messageRef.current?.addMessage(i18next.t('Registration failed') + ' ' + err.message, 'error');
      });
  }

  useEffect(() => {
    handleCheckVersion();

    let token = localStorage.getItem('token');
    if (token) {
      router.push('/main');
    } else {
      console.log('No token found, staying on login page');
    }

    let lang = localStorage.getItem('lang');
    if (!lang) {
      invoke('get_system_language').then((lng) => {
        console.log('System language:', lng);
        localStorage.setItem('lang', lng);
        lang = lng;
      });
    }
    setLanguage(lang);
  }, []);

  return (
    <div className="min-h-screen flex flex-col justify-center items-center">
      <div className="w-full max-w-[350px] mx-auto p-6 border border-white/70 rounded-lg bg-white/40 shadow-xl">
        <form onSubmit={handleSubmit} className="max-w-[275px] mx-auto">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700">{i18next.t('Email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block w-full px-3 py-2 border border-blue-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 max-w-[275px]"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700">{i18next.t('Password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 block w-full px-3 py-2 border border-blue-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 max-w-[275px]"
            />
          </div>
          {!isLogin && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700">{i18next.t('Referral Code (Optional)')}</label>
              <input
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-blue-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 max-w-[275px]"
              />
            </div>
          )}
          <button
            type="submit"
            className="w-full py-2 px-4 bg-blue-400 text-white rounded-md hover:bg-blue-500 transition-colors disabled:opacity-50 max-w-[275px]"
            disabled={versionSupported === false}
          >
            {isLogin ? i18next.t('Login') : i18next.t('Register')}
          </button>
        </form>
        <div className="text-center mt-4">
          <p className="text-sm text-gray-600">
            {isLogin ? i18next.t("Don't have an account?") : i18next.t('Already have an account?')} {' '}
            <a
              href="#"
              onClick={() => setIsLogin(!isLogin)}
              className="text-blue-600 hover:underline"
            >
              {isLogin ? i18next.t('Register') : i18next.t('Login')}
            </a>
          </p>
        </div>
      </div>

      <AutoDismissMessageQueue ref={messageRef} />
    </div>

  );
}