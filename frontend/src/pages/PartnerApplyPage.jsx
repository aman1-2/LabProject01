import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/layout/Navbar.jsx';
import Card from '../components/atoms/Card.jsx';
import Button from '../components/atoms/Button.jsx';
import Input from '../components/atoms/Input.jsx';
import { useAuth } from '../context/AuthContext.jsx';

import { CITY } from '../lib/locale.js';
export function PartnerApplyPage() {
  const navigate = useNavigate();
  const { api } = useAuth();

  const [partnerType, setPartnerType] = useState('doctor'); // 'doctor' | 'lab'
  const [formData, setFormData] = useState({
    name: '',
    regNumber: '',
    facilityName: '',
    specialityOrServices: '',
    area: '',
    phone: '',
    notes: '',
  });

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!formData.name || !formData.facilityName || !formData.specialityOrServices || !formData.area || !formData.phone) {
      setErrorMessage('Please fill in all required fields.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/api/partner/apply', {
        type: partnerType,
        ...formData,
      });

      if (res.data?.success) {
        setSubmitted(true);
      }
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message || 'Failed to submit application. Please check your details and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-[720px] w-full mx-auto px-7 py-10">
        {submitted ? (
          /* Application Success View matching prototype line 786 */
          <Card className="p-11 text-center" data-testid="partner-success-card">
            <div className="w-[58px] h-[58px] rounded-pill bg-greenBg flex items-center justify-center mx-auto mb-4 text-green">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path
                  d="M20 6L9 17l-5-5"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1 className="text-[22px] font-extrabold text-ink mb-2">
              Application received
            </h1>
            <p className="text-body text-muted mb-6 leading-relaxed">
              Our partnerships team will call you within two working days to verify your details.
            </p>
            <Button
              variant="primary"
              size="medium"
              onClick={() => navigate('/')}
              data-testid="partner-back-home-button"
            >
              Back to home
            </Button>
          </Card>
        ) : (
          /* Application Form View matching prototype lines 772-784 */
          <div>
            <h1 className="text-[27px] font-extrabold text-ink mb-2">
              Partner with PathCare
            </h1>
            <p className="text-body text-muted leading-relaxed mb-6">
              We are onboarding doctors and diagnostic labs across {CITY}. Tell us about your practice and we will get in touch within two working days.
            </p>

            <Card className="p-6 sm:p-8 mb-6" data-testid="partner-form-card">
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Type Selection */}
                <div>
                  <p className="font-bold text-caption text-ink mb-2.5">I am a…</p>
                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => setPartnerType('doctor')}
                      className={`px-4 py-2 rounded-pill font-bold text-caption transition cursor-pointer select-none ${
                        partnerType === 'doctor'
                          ? 'bg-blue600 text-white shadow-sm'
                          : 'bg-chipGreyBg text-muted hover:text-ink'
                      }`}
                      data-testid="partner-type-doctor"
                    >
                      Doctor / Clinic
                    </button>
                    <button
                      type="button"
                      onClick={() => setPartnerType('lab')}
                      className={`px-4 py-2 rounded-pill font-bold text-caption transition cursor-pointer select-none ${
                        partnerType === 'lab'
                          ? 'bg-blue600 text-white shadow-sm'
                          : 'bg-chipGreyBg text-muted hover:text-ink'
                      }`}
                      data-testid="partner-type-lab"
                    >
                      Diagnostic Lab
                    </button>
                  </div>
                </div>

                {errorMessage && (
                  <div className="p-3 bg-redBg text-redDark rounded-lg text-caption font-semibold">
                    {errorMessage}
                  </div>
                )}

                {/* Form Inputs matching prototype lines 777-780 */}
                <Input
                  label="Full Name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Full name"
                  required
                />

                <Input
                  label={
                    partnerType === 'doctor'
                      ? 'Medical Registration Number'
                      : 'NABL / ISO Certificate Number'
                  }
                  name="regNumber"
                  value={formData.regNumber}
                  onChange={handleChange}
                  placeholder={
                    partnerType === 'doctor'
                      ? 'Medical registration number (e.g. UKMC-12345)'
                      : 'NABL / ISO certificate number'
                  }
                />

                <Input
                  label={partnerType === 'doctor' ? 'Clinic Name' : 'Laboratory Name'}
                  name="facilityName"
                  value={formData.facilityName}
                  onChange={handleChange}
                  placeholder={
                    partnerType === 'doctor' ? 'Clinic name' : 'Laboratory name'
                  }
                  required
                />

                <Input
                  label="Speciality or Services Offered"
                  name="specialityOrServices"
                  value={formData.specialityOrServices}
                  onChange={handleChange}
                  placeholder="Speciality or services offered"
                  required
                />

                <Input
                  label={`Area in ${CITY}`}
                  name="area"
                  value={formData.area}
                  onChange={handleChange}
                  placeholder={`Area in ${CITY}`}
                  required
                />

                <Input
                  label="Mobile Number"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="Mobile number"
                  required
                />

                <div>
                  <label className="block font-bold text-caption text-ink mb-1.5">
                    Anything else we should know?
                  </label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Briefly describe your facilities, consulting hours, or questions..."
                    className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-white text-body text-ink focus:outline-none focus:border-blue600 transition resize-y"
                  />
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="large"
                  className="w-full mt-2"
                  loading={loading}
                  disabled={loading}
                  data-testid="partner-submit-button"
                >
                  Submit application
                </Button>
              </form>
            </Card>

            {/* Explanatory Box matching prototype lines 782-783 */}
            <div className="card p-5 bg-blue50 border-none rounded-xl">
              <h2 className="font-extrabold text-caption text-ink mb-1.5">
                How partnership works
              </h2>
              <p className="text-caption text-blue700 leading-relaxed">
                <span className="font-bold">Doctors:</span> a flat monthly platform subscription — currently free while we build the network. PathCare never takes a share of your consultation fee.
                <br />
                <br />
                <span className="font-bold">Labs:</span> a monthly platform fee plus a per-booking commission, with NABL or ISO accreditation verified before you go live.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default PartnerApplyPage;
