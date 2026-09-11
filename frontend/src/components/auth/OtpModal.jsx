import React, { useState, useEffect, useRef } from 'react';
import Button from '../atoms/Button.jsx';
import Modal from '../atoms/Modal.jsx';
import Icon from '../atoms/Icon.jsx';

export function OtpModal({ isOpen, onClose, phone, onVerify, onResend, isVerifying, error }) {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (!isOpen) return;

    setOtp(['', '', '', '', '', '']);
    setCountdown(60);
    setCanResend(false);

    setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 100);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  const handleChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    const fullOtp = newOtp.join('');
    if (fullOtp.length === 6) {
      onVerify(fullOtp);
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').trim();
    if (/^\d{6}$/.test(pasteData)) {
      const digits = pasteData.split('');
      setOtp(digits);
      inputRefs.current[5]?.focus();
      onVerify(pasteData);
    }
  };

  const handleResendClick = async () => {
    if (!canResend) return;
    setOtp(['', '', '', '', '', '']);
    setCountdown(60);
    setCanResend(false);
    await onResend();
    inputRefs.current[0]?.focus();
  };

  const isComplete = otp.every((d) => d !== '');

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="text-center mb-6">
        <div className="w-12 h-12 rounded-full bg-blue100 text-blue600 flex items-center justify-center mx-auto mb-3 text-xl font-bold select-none">
         
        </div>
        <h2 className="text-pageTitle font-extrabold text-ink">Enter Verification Code</h2>
        <p className="text-bodySmall text-muted mt-1">
          We sent a 6-digit OTP to <span className="font-bold text-ink">+91 {phone}</span>
        </p>
      </div>

      {error && (
        <div className="mb-5 p-3 rounded-md bg-redBg border border-red text-redDark text-caption font-medium flex items-center gap-2">
          <Icon name="alert" size={16} className="inline-block shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 6 Digit Inputs matching prototype .otp-box */}
      <div className="flex justify-between gap-2 sm:gap-2.5 mb-6" onPaste={handlePaste}>
        {otp.map((digit, idx) => (
          <input
            key={idx}
            ref={(el) => (inputRefs.current[idx] = el)}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            className="w-12 h-14 sm:w-13 sm:h-14 text-center text-2xl font-extrabold border-[1.5px] border-border rounded-md focus:border-blue600 focus:ring-4 focus:ring-blue100 bg-bg focus:bg-white outline-none transition"
            disabled={isVerifying}
          />
        ))}
      </div>

      <Button
        variant="primary"
        onClick={() => onVerify(otp.join(''))}
        disabled={!isComplete || isVerifying}
        className="w-full"
      >
        {isVerifying ? 'Verifying...' : 'Verify & Continue'}
      </Button>

      {/* Countdown & Resend */}
      <div className="mt-6 flex flex-col items-center justify-center text-caption text-muted gap-1">
        {canResend ? (
          <button
            type="button"
            onClick={handleResendClick}
            className="text-blue600 hover:text-blue700 font-bold focus:outline-none underline cursor-pointer"
          >
            Resend OTP
          </button>
        ) : (
          <span className="text-muted">
            Resend code in <span className="font-bold text-ink">{countdown}s</span>
          </span>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-3 text-muted2 hover:text-muted focus:outline-none cursor-pointer text-caption"
        >
          Cancel and go back
        </button>
      </div>
    </Modal>
  );
}

export default OtpModal;
