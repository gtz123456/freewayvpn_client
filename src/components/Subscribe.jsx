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

const Subscribe = ({ messageRef, user }) => {
  const [paymentLink, setPaymentLink] = useState(null);
  const [step, setStep] = useState(1); // 1: Main, 2: Recharge, 3: Payment QR
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('TRX');
  const [actualAmount, setActualAmount] = useState(0);
  const [voucherCode, setVoucherCode] = useState('');

  const server = 'http://146.235.210.34:8001';

  const handleSubscribe = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(server + '/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': token },
        body: JSON.stringify({ plan: 'Premium plan', duration: 1 }),
      });
      if (!res.ok) throw new Error('Request failed');
      messageRef.current?.addMessage(i18next.t('Subscription successful!'), 'success');
      setTimeout(() => window.location.reload(), 2000);
    } catch {
      messageRef.current?.addMessage('Subscription request failed', 'error');
    }
  };

  const handlePayment = async () => {
    // Validate amount， a number with up to two decimal places
    if (
      !amount ||
      isNaN(amount) ||
      !/^\d+(\.\d{1,2})?$/.test(amount)
    ) {
      messageRef.current?.addMessage(i18next.t('Invalid amount, please enter a number with up to two decimal places'), 'error');
      return;
    }
    setLoading(true);
    setPaymentLink(null);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(server + '/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': token },
        body: JSON.stringify({ amount: parseInt(parseFloat(amount) * 100), method, "currency": "USD" }),
      });
      if (!res.ok) throw new Error('Payment request failed' + (await res.text()));
      const data = await res.json();
      console.log('Payment data:', data);
      setActualAmount(data.actual_amount);
      setPaymentLink(data.trx_address);
      setStep(3);
    } catch (error) {
      messageRef.current?.addMessage('Payment request failed: ' + error, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleVoucherRedeem = async () => {
    if (!voucherCode.trim()) {
      messageRef.current?.addMessage('Please enter voucher code', 'error');
      return;
    }
    setLoading(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(server + '/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': token },
        body: JSON.stringify({ code: voucherCode }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Redeem failed');
      }
      messageRef.current?.addMessage(i18next.t('Voucher redeemed successfully!'), 'success');
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      messageRef.current?.addMessage(err.message || 'Redeem failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleReload = () => setStep(2);
  const handleBack = () => {
    setStep(1);
    setPaymentLink(null);
    setVoucherCode('');
  };

  return (
    <div className="absolute top-full right-0 mt-2 w-64 p-4 bg-white rounded-xl shadow-lg z-10 border border-gray-100">
      {/* Step 1: Main page */}
      {step === 1 && (
        <div className="text-center">
          <div className="flex justify-center items-center gap-2 mb-2">
            <span>{i18next.t('Balance') + ':'}</span>
            <span>{user?.balance !== undefined ? `${user?.balance / 100} USD` : '?'}</span>
            <button
              onClick={handleReload}
              className="p-1 rounded bg-blue-400 text-white hover:bg-blue-500 transition"
              title="Reload Balance"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
          </div>

          <h2 className="text-2xl font-semibold mb-4">{i18next.t('Premium')}</h2>
          <ul className="mb-2 list-none text-gray-700 inline-block text-left">
            {PREMIUM_FEATURES.map((f) => (
              <li className="relative pl-8 mb-2" key={f}>
                <svg xmlns="http://www.w3.org/2000/svg"
                     className="h-5 w-5 text-green-500 absolute left-0 top-1"
                     fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            {loading ? 'Loading...' : i18next.t('Subscribe Now')}
          </button>
        </div>
      )}

      {/* Step 2: Recharge page */}
      {step === 2 && (
        <>
          <div className="flex items-center mb-4 relative">
            <button
              onClick={handleBack}
              className="absolute left-0 p-2 rounded bg-gray-200 hover:bg-gray-300 transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5"
                   fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="flex-grow text-center text-lg font-semibold">{i18next.t('Recharge')}</h2>
          </div>

          {/* if voucher selected, show voucher input; else show normal payment */}
          {method === 'Voucher' ? (
            <div className="flex flex-col gap-3">
              <input
                type="text"
                value={voucherCode}
                onChange={(e) => setVoucherCode(e.target.value)}
                placeholder={i18next.t('Enter voucher code')}
                className="border p-2 rounded w-full"
              />
              <button
                onClick={handleVoucherRedeem}
                disabled={loading}
                className="bg-green-500 text-white rounded-lg p-2 hover:bg-green-600 transition"
              >
                {loading ? i18next.t('Processing...') : i18next.t('Redeem Voucher')}
              </button>
              <button
                onClick={() => setMethod('TRX')}
                className="text-blue-500 text-sm underline"
              >
                {i18next.t('Use other payment methods')}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={i18next.t('Enter amount (USD)')}
                className="border p-2 rounded w-full"
              />

              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="border p-2 rounded w-full"
              >
                <option value="TRX">TRX</option>
                <option value="USDT - TRC20">USDT - TRC20</option>
                <option value="Gift card - STEAM">{i18next.t('Gift card - STEAM')}</option>
                <option value="Voucher">{i18next.t('Voucher Code')}</option>
              </select>

              <button
                onClick={handlePayment}
                disabled={loading}
                className="bg-blue-400 text-white rounded-lg p-2 hover:bg-blue-500 transition"
              >
                {loading ? i18next.t('Processing...') : i18next.t('Proceed to Pay')}
              </button>
            </div>
          )}
        </>
      )}

      {/* Step 3: Payment QR page */}
      {step === 3 && (
        <>
          <div className="flex justify-between items-center mb-4">
            <button onClick={() => setStep(2)} className="p-2 rounded bg-gray-200 hover:bg-gray-300 transition">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5"
                   fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>{actualAmount} {method}</div>
          </div>

          {paymentLink ? (
            <div className="text-center">
              <div className="mb-2">{i18next.t('Scan or click the QR code')}</div>
              <QRCodeSVG
                value={paymentLink}
                size={180}
                onClick={() => {
                  navigator.clipboard.writeText(paymentLink);
                  messageRef.current?.addMessage(i18next.t('Payment address copied to clipboard'), 'success');
                }}
              />
            </div>
          ) : (
            <div className="text-center text-gray-500">{i18next.t('Fetching payment link...')}</div>
          )}
        </>
      )}
    </div>
  );
};

export default Subscribe;
