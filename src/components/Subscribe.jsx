import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

import i18next from 'i18next';

const PREMIUM_FEATURES = [
  '100GB/month',
  '5 Devices allowed',
  'Access to premium servers',
  'Higher speed and lower latency',
];

const PREMIUM_PRICE = '$3/month';

const Subscribe = ({ messageRef }) => {
  const [paymentLink, setPaymentLink] = useState(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const server = 'http://146.235.210.34:8001';

  const handleSubscribe = async () => {
    setLoading(true);
    setPaymentLink(null);
    try {
      const res = await fetch(server + '/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'premium' }),
      });
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();
      setPaymentLink(data.url);
      setLoading(false);
      setStep(2);
    } catch (err) {
      messageRef.current?.addMessage('Subscription request failed', 'error');
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    handleSubscribe();
  };

  const handleBack = () => {
    setStep(1);
    setPaymentLink(null);
  };

  return (
    <div className="absolute top-full right-0 mt-2 w-58 p-4 bg-white rounded-xl shadow-lg z-10 border border-gray-100">
      {step === 1 && (
        <>
        <div className="text-center">
            <h2 className="text-2xl font-semibold mb-4">{i18next.t('Premium')}</h2>

            <ul className="mb-2 list-none text-gray-700 inline-block text-left">
              {PREMIUM_FEATURES.map((f) => (
                <li className="relative pl-8 mb-2" key={f}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-green-500 absolute left-0 top-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {i18next.t(f)}
                </li>
              ))}
            </ul>

            <div className="font-bold text-xl my-4 mt-0 mb-2">{i18next.t(PREMIUM_PRICE)}</div>
            <button
            onClick={handleSubscribe}
            disabled={loading}
            className="w-40 h-14 rounded-3xl text-white font-semibold transition-all duration-300 bg-blue-400 hover:bg-blue-500 hover:scale-103 shadow-lg flex items-center justify-center mx-auto"
            >
            {loading ? 'Loading...' : 'Subscribe Now'}
            </button>
        </div>
        </>

      )}

      {step === 2 && (
        <>
          <div className="flex justify-between items-center mb-4">
            {/* Back Button */}
            <button
              onClick={handleBack}
              className="p-2 rounded bg-gray-200 hover:bg-gray-300 transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={loading}
              className={`p-2 rounded bg-blue-400 text-white hover:bg-blue-500 transition ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              aria-label="Refresh"
              title="Refresh"
              >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M23 4v6h-6" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>

          </div>

          {paymentLink ? (
            <div className="text-center">
              <div className="mb-2">Scan or click the QR code</div>
              <QRCodeSVG value={paymentLink} size={180} onClick={() => window.open(paymentLink, '_blank')} />
            </div>
          ) : (
            <div className="text-center text-gray-500">Fetching payment link...</div>
          )}
        </>
      )}
    </div>
  );
};

export default Subscribe;
