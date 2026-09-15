import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Navbar from '../components/layout/Navbar.jsx';
import Card from '../components/atoms/Card.jsx';
import Button from '../components/atoms/Button.jsx';
import EmptyState from '../components/atoms/EmptyState.jsx';
import Modal from '../components/atoms/Modal.jsx';
import Icon from '../components/atoms/Icon.jsx';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar.jsx';
import SubscriptionsPanel from '../components/organisms/SubscriptionsPanel.jsx';

import { SAMPLE_ADDRESS } from '../lib/locale.js';
export default function ProfilePage() {
  const { user, api, logout, updateUser } = useAuth();
  const navigate = useNavigate();

  // Active Tab: 'fam' | 'me' | 'addr' | 'bk' | 'rep' | 'sub'
  const [activeTab, setActiveTab] = useState('fam');

  // Real data state
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  const [addresses, setAddresses] = useState([]);
  const [loadingAddresses, setLoadingAddresses] = useState(true);

  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(true);

  const [profileName, setProfileName] = useState(user?.name || '');
  const [profilePhone, setProfilePhone] = useState(user?.phone || '');
  const [profileLocation, setProfileLocation] = useState(user?.location?.address || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState(null);

  useEffect(() => {
    if (user) {
      setProfileName(user.name || '');
      setProfilePhone(user.phone || '');
      setProfileLocation(user.location?.address || '');
    }
  }, [user]);

  // Add Member Modal State
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [formMemberName, setFormMemberName] = useState('');
  const [formMemberRelation, setFormMemberRelation] = useState('');
  const [formMemberAge, setFormMemberAge] = useState('');
  const [formMemberGender, setFormMemberGender] = useState('other');
  const [formMemberSubmitting, setFormMemberSubmitting] = useState(false);
  const [formMemberError, setFormMemberError] = useState(null);

  // Add Address Modal State
  const [isAddAddressModalOpen, setIsAddAddressModalOpen] = useState(false);
  const [formAddrLabel, setFormAddrLabel] = useState('Home');
  const [formAddrLine, setFormAddrLine] = useState('');
  const [formAddrPin, setFormAddrPin] = useState('');
  const [formAddrIsDefault, setFormAddrIsDefault] = useState(false);
  const [formAddrSubmitting, setFormAddrSubmitting] = useState(false);
  const [formAddrError, setFormAddrError] = useState(null);

  // Cancel Booking Modal State
  const [cancelModalBooking, setCancelModalBooking] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  // Reschedule Booking Modal State
  const [rescheduleModalBooking, setRescheduleModalBooking] = useState(null);
  const [rescheduleSlot, setRescheduleSlot] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleError, setRescheduleError] = useState(null);

  // Toast feedback state
  const [toastMsg, setToastMsg] = useState(null);

  // Reports tab filter state ('all' | 'self' | memberId)
  const [reportFilter, setReportFilter] = useState('all');

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Fetch Family Members
  const fetchMembers = async () => {
    try {
      setLoadingMembers(true);
      const res = await api.get('/api/family-members');
      setMembers(res.data?.data || []);
    } catch {
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  };

  // Fetch Addresses
  const fetchAddresses = async () => {
    try {
      setLoadingAddresses(true);
      const res = await api.get('/api/addresses');
      setAddresses(res.data?.data || []);
    } catch {
      setAddresses([]);
    } finally {
      setLoadingAddresses(false);
    }
  };

  // Fetch Bookings
  const fetchBookings = async () => {
    try {
      setLoadingBookings(true);
      const res = await api.get('/api/bookings');
      setBookings(res.data?.data || []);
    } catch {
      setBookings([]);
    } finally {
      setLoadingBookings(false);
    }
  };

  useEffect(() => {
    fetchMembers();
    fetchAddresses();
    fetchBookings();
  }, [api]);

  // Handle Save Profile
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      setSavingProfile(true);
      setProfileError(null);
      const payload = {
        name: profileName.trim(),
        phone: profilePhone.trim(),
      };
      if (profileLocation.trim()) {
        payload.location = {
          address: profileLocation.trim(),
          lat: user?.location?.lat || 30.3165,
          lng: user?.location?.lng || 78.0322,
          source: 'manual',
        };
      }
      const res = await api.patch('/api/users/me', payload);
      const updated = res.data?.data;
      if (updated) {
        updateUser(updated);
      }
      showToast('Profile updated.');
    } catch (err) {
      setProfileError(
        err.response?.data?.error?.message || err.message || 'Failed to update profile.'
      );
    } finally {
      setSavingProfile(false);
    }
  };

  // Handle Add Member
  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!formMemberName.trim() || !formMemberRelation.trim() || !formMemberAge) {
      setFormMemberError('Please enter name, relation, and age.');
      return;
    }

    try {
      setFormMemberSubmitting(true);
      setFormMemberError(null);
      const payload = {
        name: formMemberName.trim(),
        relation: formMemberRelation.trim(),
        age: parseInt(formMemberAge, 10),
        gender: formMemberGender,
      };

      const res = await api.post('/api/family-members', payload);
      const created = res.data?.data;
      const newAccountType = res.data?.accountType;

      if (newAccountType && user?.accountType !== newAccountType) {
        updateUser({ accountType: newAccountType });
        showToast(`${created.name} added. Your account is now a family account.`);
      } else {
        showToast(`${created.name} added to your family account.`);
      }

      setFormMemberName('');
      setFormMemberRelation('');
      setFormMemberAge('');
      setFormMemberGender('other');
      setIsAddMemberModalOpen(false);
      await fetchMembers();
    } catch (err) {
      setFormMemberError(
        err.response?.data?.error?.message || err.message || 'Failed to add member.'
      );
    } finally {
      setFormMemberSubmitting(false);
    }
  };

  // Handle Remove Member
  const handleRemoveMember = async (memberId, memberName) => {
    if (!window.confirm(`Are you sure you want to remove ${memberName}?`)) {
      return;
    }
    try {
      await api.delete(`/api/family-members/${memberId}`);
      showToast('Member removed.');
      await fetchMembers();
    } catch (err) {
      showToast(err.response?.data?.error?.message || 'Failed to remove member.');
    }
  };

  // Handle Add Address
  const handleAddAddress = async (e) => {
    e.preventDefault();
    if (!formAddrLine.trim() || !formAddrPin.trim()) {
      setFormAddrError('Enter the address and pincode.');
      return;
    }

    try {
      setFormAddrSubmitting(true);
      setFormAddrError(null);
      const payload = {
        label: formAddrLabel,
        line: formAddrLine.trim(),
        pincode: formAddrPin.trim(),
        isDefault: addresses.length === 0 || formAddrIsDefault,
      };

      await api.post('/api/addresses', payload);
      showToast('Address saved.');
      setFormAddrLine('');
      setFormAddrPin('');
      setFormAddrIsDefault(false);
      setIsAddAddressModalOpen(false);
      await fetchAddresses();
    } catch (err) {
      setFormAddrError(
        err.response?.data?.error?.message || err.message || 'Failed to save address.'
      );
    } finally {
      setFormAddrSubmitting(false);
    }
  };

  // Handle Set Default Address
  const handleSetDefaultAddress = async (addressId) => {
    try {
      await api.patch(`/api/addresses/${addressId}`, { isDefault: true });
      showToast('Default address updated.');
      await fetchAddresses();
    } catch (err) {
      showToast(err.response?.data?.error?.message || 'Failed to set default address.');
    }
  };

  // Handle Delete Address
  const handleDeleteAddress = async (addressId) => {
    try {
      await api.delete(`/api/addresses/${addressId}`);
      showToast('Address removed.');
      await fetchAddresses();
    } catch (err) {
      showToast(err.response?.data?.error?.message || 'Failed to remove address.');
    }
  };

  // Handle Reschedule Booking
  const handleRescheduleSubmit = async (e) => {
    e.preventDefault();
    if (!rescheduleSlot) {
      setRescheduleError('Please choose a valid future date and time.');
      return;
    }

    try {
      setRescheduling(true);
      setRescheduleError(null);
      await api.patch(`/api/bookings/${rescheduleModalBooking._id}/reschedule`, {
        slotDateTime: new Date(rescheduleSlot).toISOString(),
      });
      showToast('Booking rescheduled successfully.');
      setRescheduleModalBooking(null);
      setRescheduleSlot('');
      await fetchBookings();
    } catch (err) {
      setRescheduleError(
        err.response?.data?.error?.message || err.message || 'Failed to reschedule booking.'
      );
    } finally {
      setRescheduling(false);
    }
  };

  // Handle Cancel Booking
  const handleCancelSubmit = async (e) => {
    e.preventDefault();
    try {
      setCancelling(true);
      setCancelError(null);
      const res = await api.patch(`/api/bookings/${cancelModalBooking._id}/cancel`, {
        reason: cancelReason.trim() || 'Cancelled by user',
      });
      const refund = res.data?.refundAmount;
      if (refund && refund > 0) {
        showToast(`Booking cancelled. ₹${refund} will be refunded.`);
      } else {
        showToast('Booking cancelled.');
      }
      setCancelModalBooking(null);
      setCancelReason('');
      await fetchBookings();
    } catch (err) {
      setCancelError(
        err.response?.data?.error?.message || err.message || 'Failed to cancel booking.'
      );
    } finally {
      setCancelling(false);
    }
  };

  // Check if booking is in a cancellable/reschedulable state
  const isActionableBooking = (status) => {
    return !['collected', 'at_lab', 'report_ready', 'cancelled'].includes(status);
  };

  // Filtered reports for reports tab
  const completedReports = useMemo(() => {
    return bookings.filter(
      (b) => b.status === 'completed' || b.status === 'report_ready'
    );
  }, [bookings]);

  const filteredReports = useMemo(() => {
    if (reportFilter === 'all') return completedReports;
    if (reportFilter === 'self') {
      return completedReports.filter((b) => !b.familyMemberId);
    }
    return completedReports.filter(
      (b) =>
        b.familyMemberId?._id === reportFilter ||
        b.familyMemberId === reportFilter
    );
  }, [completedReports, reportFilter]);

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />

      {/* Toast Notification */}
      {toastMsg && (
        <div
          role="alert"
          className="fixed bottom-6 right-6 z-50 bg-ink text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-float animate-fade-in flex items-center gap-2"
          data-testid="profile-toast"
        >
          <Icon name="check" size={15} strokeWidth={2.8} className="text-green" />
          <span>{toastMsg}</span>
        </div>
      )}

      <main className="flex-1 max-w-[1180px] w-full mx-auto px-5 sm:px-7 py-8">
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-8 items-start">
          {/* Left Sidebar */}
          <div>
            {/* The identity block was a 56px circle on a white card — the same
                visual weight as a form field, on the one page that is entirely
                about who you are. Given a dark band it reads as a header, and
                the account type stops being a chip nobody notices. */}
            <div
              className="relative mb-4 overflow-hidden rounded-2xl bg-blue900 p-5 text-center"
              data-testid="profile-header"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full opacity-50 blur-2xl"
                style={{ background: 'radial-gradient(circle, #4F72E8 0%, transparent 70%)' }}
              />
              <div className="relative">
                <Avatar
                  size="lg"
                  className="mx-auto size-16 ring-4 ring-white/15 after:border-0"
                  data-testid="profile-avatar"
                >
                  <AvatarImage src={user?.avatarUrl} alt="" />
                  <AvatarFallback name={user?.name || 'U'} className="text-xl" />
                </Avatar>
                <h2 className="mt-3.5 text-base font-extrabold text-white" data-testid="profile-name">
                  {user?.name || 'Your account'}
                </h2>
                <p className="mt-1 text-caption text-white/60" data-testid="profile-handle">
                  @{user?.accountHandle} {user?.phone ? `· +91 ${user.phone}` : ''}
                </p>
                <span
                  className="mt-3 inline-flex items-center gap-1.5 rounded-pill bg-white/10 px-3 py-1.5 text-caption font-bold text-white backdrop-blur"
                  data-testid="profile-account-type"
                >
                  <Icon
                    name={user?.accountType === 'family' ? 'users' : 'user'}
                    size={12}
                    strokeWidth={2.3}
                  />
                  {user?.accountType === 'family' ? 'Family account' : 'Single account'}
                </span>

                {/* Every figure here is counted from data this page already
                    loaded, and every one is a button into the records behind
                    it. Two rules from the pattern this follows: no vanity
                    metrics, and no dead numbers. A new account shows three
                    zeros, which is the honest thing for it to show. */}
                <div className="mt-5 grid grid-cols-3 gap-1 border-t border-white/15 pt-4">
                  {[
                    { key: 'bk', label: 'Bookings', value: bookings.length },
                    { key: 'rep', label: 'Reports', value: completedReports.length },
                    { key: 'fam', label: 'Family', value: members.length },
                  ].map((stat) => (
                    <button
                      key={stat.key}
                      type="button"
                      onClick={() => setActiveTab(stat.key)}
                      data-testid={`profile-stat-${stat.key}`}
                      className="rounded-lg py-1 transition hover:bg-white/10"
                    >
                      <span className="block text-lg font-extrabold leading-none text-white">
                        {stat.value}
                      </span>
                      <span className="mt-1 block text-caption text-white/55">{stat.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Navigation Tab Links (Responsive: horizontal scroll on mobile, vertical column on desktop) */}
            <div className="flex md:flex-col flex-row overflow-x-auto no-scrollbar gap-1.5 p-1">
              {[
                { key: 'fam', icon: 'users', label: 'Family Members' },
                { key: 'me', icon: 'user', label: 'My Profile' },
                { key: 'addr', icon: 'mapPin', label: 'Addresses' },
                { key: 'bk', icon: 'calendar', label: 'Bookings' },
                { key: 'rep', icon: 'file', label: 'Reports' },
                { key: 'sub', icon: 'repeat', label: 'Subscriptions' },
              ].map((tab) => {
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    data-testid={`tab-${tab.key}`}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-2.5 whitespace-nowrap rounded-xl px-4 py-2.5 text-left text-sm font-bold transition ${
                      active
                        ? 'bg-blue50 font-extrabold text-blue600'
                        : 'text-muted hover:bg-white hover:text-ink'
                    }`}
                  >
                    <Icon name={tab.icon} size={16} strokeWidth={2.1} />
                    {tab.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  navigate('/auth');
                }}
                data-testid="profile-logout"
                className="flex items-center gap-2.5 whitespace-nowrap rounded-xl px-4 py-2.5 text-left text-sm font-bold text-red transition hover:bg-redBg md:mt-2 md:border-t md:border-border md:pt-4"
              >
                <Icon name="logOut" size={16} strokeWidth={2.1} />
                Log out
              </button>
            </div>
          </div>

          {/* Right Panel */}
          <div>
            {/* 1. FAMILY MEMBERS TAB */}
            {activeTab === 'fam' && (
              <div data-testid="family-members-section">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h1 className="text-pageTitle font-extrabold text-ink">Family Members</h1>
                    <p className="text-bodySmall text-muted mt-0.5">
                      Manage registered family members to book tests and share access.
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="small"
                    onClick={() => setIsAddMemberModalOpen(true)}
                    data-testid="add-family-member-btn"
                  >
                    + Add Member
                  </Button>
                </div>

                {loadingMembers ? (
                  <div className="p-10 text-center text-muted text-sm" data-testid="loading-members">
                    Loading family members...
                  </div>
                ) : members.length === 0 ? (
                  <EmptyState
                    icon="users"
                    title="No family members yet"
                    body={
                      user?.accountType === 'family'
                        ? 'Add a parent, spouse or child to book tests and keep their reports alongside yours.'
                        : 'Add someone to your account to book tests and keep their reports alongside yours.'
                    }
                    ctaText="+ Add member"
                    onCtaClick={() => setIsAddMemberModalOpen(true)}
                    data-testid="family-empty-state"
                  />
                ) : (
                  <div
                    className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4"
                    data-testid="family-members-grid"
                  >
                    {members.map((member) => (
                      <Card
                        key={member._id}
                        className="p-5 text-center relative border border-border"
                        data-testid={`family-member-card-${member._id}`}
                      >
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(member._id, member.name)}
                          className="absolute top-3 right-3 text-red hover:underline text-xs font-bold cursor-pointer"
                          data-testid={`remove-member-${member._id}`}
                        >
                          Remove
                        </button>
                        <Avatar
                          size="lg"
                          className="mx-auto mb-2.5 size-[52px] after:border-0"
                          data-testid={`member-avatar-${member._id || member.id}`}
                        >
                          <AvatarFallback name={member.name} className="text-[17px]" />
                        </Avatar>
                        <h3 className="font-extrabold text-sm text-ink mb-0.5">{member.name}</h3>
                        <p className="text-muted text-xs">
                          {member.relation} · {member.age} yrs
                        </p>
                        {member.gender && (
                          <div className="mt-2">
                            <span className="text-[11px] bg-chipGreyBg text-muted px-2 py-0.5 rounded-md capitalize">
                              {member.gender}
                            </span>
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 2. MY PROFILE TAB */}
            {activeTab === 'me' && (
              <div data-testid="profile-section">
                <h1 className="text-pageTitle font-extrabold text-ink mb-6">My Profile</h1>
                <Card className="p-6 max-w-[480px]">
                  <form onSubmit={handleSaveProfile} className="space-y-4">
                    {profileError && (
                      <div className="p-3 bg-red/10 border border-red/30 rounded-xl text-red text-xs font-semibold">
                        {profileError}
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-bold text-ink block mb-1.5">
                        Account handle
                      </label>
                      <input
                        className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-neutral-100 text-muted cursor-not-allowed outline-none"
                        value={`@${user?.accountHandle || ''}`}
                        disabled
                        data-testid="profile-handle-input"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-ink block mb-1.5">Full name</label>
                      <input
                        className="w-full border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-blue600 focus:ring-2 focus:ring-blue100"
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        required
                        data-testid="profile-name-input"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-ink block mb-1.5">
                        Mobile number
                      </label>
                      <input
                        className="w-full border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-blue600 focus:ring-2 focus:ring-blue100"
                        value={profilePhone}
                        onChange={(e) => setProfilePhone(e.target.value)}
                        required
                        data-testid="profile-phone-input"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-ink block mb-1.5">Location</label>
                      <div className="flex gap-2">
                        <input
                          className="flex-1 border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-blue600 focus:ring-2 focus:ring-blue100"
                          value={profileLocation}
                          onChange={(e) => setProfileLocation(e.target.value)}
                          placeholder="Area, city"
                          data-testid="profile-location-input"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setProfileLocation(SAMPLE_ADDRESS);
                            showToast('Location detected.');
                          }}
                          className="px-3 border border-border rounded-xl hover:bg-neutral-50 transition text-sm cursor-pointer"
                          title="Detect location"
                        >
                         
                        </button>
                      </div>
                    </div>
                    <div>
                      <Button
                        type="submit"
                        variant="primary"
                        size="default"
                        className="w-full"
                        disabled={savingProfile}
                        data-testid="save-profile-btn"
                      >
                        {savingProfile ? 'Saving...' : 'Save changes'}
                      </Button>
                    </div>
                  </form>
                </Card>

                {user?.accountType === 'single' && (
                  <Card className="p-5 max-w-[480px] mt-4 bg-blue50 border-none">
                    <p className="font-extrabold text-sm text-ink mb-1">
                      Upgrade to a family account
                    </p>
                    <p className="text-blue700 text-xs leading-relaxed mb-3">
                      Add family members and manage everyone's bookings and reports from this same
                      login. No extra charge.
                    </p>
                    <Button
                      variant="primary"
                      size="small"
                      onClick={() => {
                        updateUser({ accountType: 'family' });
                        showToast('Converted to a family account.');
                      }}
                    >
                      Convert to family account
                    </Button>
                  </Card>
                )}
              </div>
            )}

            {/* 3. ADDRESS BOOK TAB */}
            {activeTab === 'addr' && (
              <div data-testid="addresses-section">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h1 className="text-pageTitle font-extrabold text-ink">Address Book</h1>
                    <p className="text-bodySmall text-muted mt-0.5">
                      Manage home and work addresses for phlebotomist sample collections.
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="small"
                    onClick={() => setIsAddAddressModalOpen(true)}
                    data-testid="add-address-btn"
                  >
                    + Add Address
                  </Button>
                </div>

                {loadingAddresses ? (
                  <div className="p-10 text-center text-muted text-sm">Loading addresses...</div>
                ) : addresses.length === 0 ? (
                  <EmptyState
                    icon="mapPin"
                    title="No saved addresses"
                    body="Save your home or work address so booking a collection takes a couple of taps next time."
                    ctaText="+ Add address"
                    onCtaClick={() => setIsAddAddressModalOpen(true)}
                    data-testid="addresses-empty-state"
                  />
                ) : (
                  <div className="space-y-3" data-testid="addresses-list">
                    {addresses.map((a) => (
                      <Card
                        key={a._id}
                        className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-border"
                        data-testid={`address-card-${a._id}`}
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs font-bold px-2.5 py-0.5 bg-blue50 text-blue700 rounded-full">
                              {a.label}
                            </span>
                            {a.isDefault && (
                              <span className="text-xs font-bold px-2.5 py-0.5 bg-green/10 text-green rounded-full">
                                Default Address
                              </span>
                            )}
                          </div>
                          <p className="font-bold text-sm text-ink">{a.line}</p>
                          <p className="text-xs text-muted mt-0.5">Pincode {a.pincode}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {!a.isDefault && (
                            <button
                              type="button"
                              onClick={() => handleSetDefaultAddress(a._id)}
                              className="text-xs font-bold text-blue600 hover:underline cursor-pointer"
                              data-testid={`set-default-${a._id}`}
                            >
                              Set as default
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteAddress(a._id)}
                            className="text-xs font-bold text-red hover:underline cursor-pointer"
                            data-testid={`delete-address-${a._id}`}
                          >
                            Delete
                          </button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 4. MY BOOKINGS TAB */}
            {activeTab === 'bk' && (
              <div data-testid="bookings-section">
                <div className="mb-6">
                  <h1 className="text-pageTitle font-extrabold text-ink">My Bookings</h1>
                  <p className="text-bodySmall text-muted mt-0.5">
                    Track status, reschedule slots, or manage specimen collection appointments.
                  </p>
                </div>

                {loadingBookings ? (
                  <div className="p-10 text-center text-muted text-sm">Loading bookings...</div>
                ) : bookings.length === 0 ? (
                  <EmptyState
                    icon="rupee"
                    title="No bookings yet"
                    body="Your booking history appears here once you book your first test."
                    ctaText="Browse tests"
                    onCtaClick={() => navigate('/tests')}
                    data-testid="bookings-empty-state"
                  />
                ) : (
                  <Card className="overflow-hidden border border-border">
                    <div className="divide-y divide-border" data-testid="bookings-list">
                      {bookings.map((b) => {
                        const testName =
                          b.testIds?.[0]?.name || b.packageId?.name || 'Diagnostic Test';
                        const labName = b.labCenterId?.name || 'PathCare Partner Lab';
                        const who = b.familyMemberId?.name
                          ? `${b.familyMemberId.name} (${b.familyMemberId.relation})`
                          : `${user?.name || 'Myself'} (Self)`;

                        const dateStr = b.slotDateTime
                          ? new Date(b.slotDateTime).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Recent';

                        const isActionable = isActionableBooking(b.status);

                        return (
                          <div key={b._id} className="rrow" data-testid={`booking-row-${b._id}`}>
                            <div>
                              <p className="font-extrabold text-sm text-ink">{testName}</p>
                              <p className="text-xs text-muted mt-0.5">
                                {labName} · for {who}
                              </p>
                            </div>
                            <span className="text-xs text-muted font-medium">{dateStr}</span>
                            <div>
                              <span
                                className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize inline-block ${
                                  b.status === 'report_ready' || b.status === 'completed'
                                    ? 'bg-green/10 text-green'
                                    : b.status === 'cancelled'
                                    ? 'bg-neutral-100 text-muted'
                                    : 'bg-blue50 text-blue700'
                                }`}
                              >
                                {b.status.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Button
                                variant="ghost"
                                size="small"
                                onClick={() => navigate(`/track/${b._id}`)}
                                data-testid={`track-btn-${b._id}`}
                              >
                                Track
                              </Button>
                              {isActionable && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="small"
                                    onClick={() => {
                                      setRescheduleModalBooking(b);
                                      setRescheduleError(null);
                                    }}
                                    data-testid={`reschedule-btn-${b._id}`}
                                  >
                                    Reschedule
                                  </Button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCancelModalBooking(b);
                                      setCancelReason('');
                                      setCancelError(null);
                                    }}
                                    className="text-xs font-bold text-red hover:underline px-2 py-1 cursor-pointer"
                                    data-testid={`cancel-btn-${b._id}`}
                                  >
                                    Cancel
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* 5. REPORTS TAB */}
            {activeTab === 'rep' && (
              <div data-testid="reports-section">
                <div className="mb-6">
                  <h1 className="text-pageTitle font-extrabold text-ink">Reports</h1>
                  <p className="text-bodySmall text-muted mt-0.5">
                    View and download clinical laboratory reports for your entire family.
                  </p>
                </div>

                {/* Filter Chips by Family Member */}
                <div
                  className="flex gap-2 flex-wrap items-center mb-6"
                  data-testid="report-filter-chips"
                >
                  <span className="text-xs font-bold text-muted mr-1">Filter by:</span>
                  <button
                    type="button"
                    onClick={() => setReportFilter('all')}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                      reportFilter === 'all'
                        ? 'bg-blue600 text-white'
                        : 'bg-chipGreyBg text-muted hover:text-ink'
                    }`}
                    data-testid="filter-all"
                  >
                    All Reports
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportFilter('self')}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                      reportFilter === 'self'
                        ? 'bg-blue600 text-white'
                        : 'bg-chipGreyBg text-muted hover:text-ink'
                    }`}
                    data-testid="filter-self"
                  >
                    Myself ({user?.name || 'You'})
                  </button>
                  {members.map((m) => (
                    <button
                      key={m._id}
                      type="button"
                      onClick={() => setReportFilter(m._id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                        reportFilter === m._id
                          ? 'bg-blue600 text-white'
                          : 'bg-chipGreyBg text-muted hover:text-ink'
                      }`}
                      data-testid={`filter-member-${m._id}`}
                    >
                      {m.name} ({m.relation})
                    </button>
                  ))}
                </div>

                {loadingBookings ? (
                  <div className="p-8 text-center text-muted text-sm">Loading reports...</div>
                ) : filteredReports.length === 0 ? (
                  <EmptyState
                    icon="file"
                    title="No reports yet"
                    body={
                      reportFilter !== 'all'
                        ? 'No lab reports found for the selected family member.'
                        : 'Reports appear here as soon as your lab uploads them, usually within hours of collection.'
                    }
                    ctaText="Browse tests"
                    onCtaClick={() => navigate('/tests')}
                    data-testid="reports-empty-state"
                  />
                ) : (
                  <div className="space-y-4" data-testid="reports-list">
                    {filteredReports.map((b) => {
                      const testName =
                        b.testIds?.[0]?.name || b.packageId?.name || 'Diagnostic Report';
                      const labName = b.labCenterId?.name || 'Clinical Lab';
                      const whoName = b.familyMemberId?.name
                        ? `${b.familyMemberId.name} (${b.familyMemberId.relation})`
                        : `${user?.name || 'Myself'} (Self)`;

                      const slotStr = b.slotDateTime
                        ? new Date(b.slotDateTime).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : 'Recent';

                      return (
                        <Card key={b._id} className="p-5 border border-border">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                            <div>
                              <p className="font-extrabold text-ink text-base">{testName}</p>
                              <p className="text-xs text-muted mt-0.5">
                                {labName} · {slotStr} · for{' '}
                                <span className="font-bold text-ink">{whoName}</span>
                              </p>
                            </div>
                            <Button
                              variant="primary"
                              size="small"
                              onClick={() => {
                                navigate(`/track/${b._id}`);
                              }}
                            >
                              View Report
                            </Button>
                          </div>
                          {b.report?.summaryHtml && (
                            <div
                              className="bg-blue50 rounded-xl p-3.5 mt-3 text-xs leading-relaxed text-ink"
                              dangerouslySetInnerHTML={{ __html: b.report.summaryHtml }}
                            />
                          )}
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 6. SUBSCRIPTIONS TAB */}
            {activeTab === 'sub' && <SubscriptionsPanel />}

          </div>
        </div>
      </main>

      {/* Add Family Member Modal */}
      <Modal
        isOpen={isAddMemberModalOpen}
        onClose={() => setIsAddMemberModalOpen(false)}
        title="Add a family member"
      >
        <form onSubmit={handleAddMember} className="space-y-4" data-testid="add-member-form">
          {formMemberError && (
            <div className="p-3 bg-red/10 border border-red/30 rounded-xl text-red text-xs font-semibold">
              {formMemberError}
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-ink block mb-1">Full name</label>
            <input
              type="text"
              placeholder="e.g. Sunita Sharma"
              value={formMemberName}
              onChange={(e) => setFormMemberName(e.target.value)}
              className="w-full border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-blue600 focus:ring-2 focus:ring-blue100"
              required
              data-testid="member-name-input"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-ink block mb-1">Relation</label>
            <input
              type="text"
              placeholder="e.g. Mother, Father, Spouse, Child"
              value={formMemberRelation}
              onChange={(e) => setFormMemberRelation(e.target.value)}
              className="w-full border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-blue600 focus:ring-2 focus:ring-blue100"
              required
              data-testid="member-relation-input"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-ink block mb-1">Age</label>
              <input
                type="number"
                placeholder="e.g. 58"
                min="0"
                max="125"
                value={formMemberAge}
                onChange={(e) => setFormMemberAge(e.target.value)}
                className="w-full border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-blue600 focus:ring-2 focus:ring-blue100"
                required
                data-testid="member-age-input"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-ink block mb-1">Gender</label>
              <select
                value={formMemberGender}
                onChange={(e) => setFormMemberGender(e.target.value)}
                className="w-full border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-blue600 focus:ring-2 focus:ring-blue100 bg-white"
                data-testid="member-gender-select"
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="default"
              className="w-full"
              disabled={formMemberSubmitting}
              data-testid="submit-member-btn"
            >
              {formMemberSubmitting ? 'Adding...' : 'Add member'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Address Modal */}
      <Modal
        isOpen={isAddAddressModalOpen}
        onClose={() => setIsAddAddressModalOpen(false)}
        title="Add an address"
      >
        <form onSubmit={handleAddAddress} className="space-y-4" data-testid="add-address-form">
          {formAddrError && (
            <div className="p-3 bg-red/10 border border-red/30 rounded-xl text-red text-xs font-semibold">
              {formAddrError}
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-ink block mb-1">Label</label>
            <select
              value={formAddrLabel}
              onChange={(e) => setFormAddrLabel(e.target.value)}
              className="w-full border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-blue600 focus:ring-2 focus:ring-blue100 bg-white"
              data-testid="address-label-select"
            >
              <option value="Home">Home</option>
              <option value="Work">Work</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-ink block mb-1">Address line</label>
            <input
              type="text"
              placeholder="Flat, building, street, area"
              value={formAddrLine}
              onChange={(e) => setFormAddrLine(e.target.value)}
              className="w-full border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-blue600 focus:ring-2 focus:ring-blue100"
              required
              data-testid="address-line-input"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-ink block mb-1">Pincode</label>
            <input
              type="text"
              placeholder="e.g. 560001"
              maxLength={6}
              value={formAddrPin}
              onChange={(e) => setFormAddrPin(e.target.value)}
              className="w-full border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-blue600 focus:ring-2 focus:ring-blue100"
              required
              data-testid="address-pin-input"
            />
          </div>

          {addresses.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="defaultAddressCheckbox"
                checked={formAddrIsDefault}
                onChange={(e) => setFormAddrIsDefault(e.target.checked)}
                className="w-4 h-4 rounded text-blue600 focus:ring-blue500 border-border"
              />
              <label htmlFor="defaultAddressCheckbox" className="text-xs font-medium text-ink">
                Make this my default address
              </label>
            </div>
          )}

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="default"
              className="w-full"
              disabled={formAddrSubmitting}
              data-testid="submit-address-btn"
            >
              {formAddrSubmitting ? 'Saving...' : 'Save address'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Cancel Booking Dialog Modal */}
      {cancelModalBooking && (
        <Modal
          isOpen={Boolean(cancelModalBooking)}
          onClose={() => setCancelModalBooking(null)}
          title="Cancel booking?"
        >
          <form onSubmit={handleCancelSubmit} className="space-y-4" data-testid="cancel-booking-form">
            {cancelError && (
              <div className="p-3 bg-red/10 border border-red/30 rounded-xl text-red text-xs font-semibold">
                {cancelError}
              </div>
            )}

            <div className="p-4 bg-neutral-50 rounded-xl text-xs leading-relaxed text-ink border border-border">
              {cancelModalBooking.paymentStatus === 'paid' ? (
                <>
                  You paid <b>₹{cancelModalBooking.amount}</b> online. We will refund{' '}
                  <b>₹{Math.max(0, cancelModalBooking.amount - 20)}</b> — a ₹20 processing fee
                  applies to prepaid cancellations. Refunds reach your account in 3–5 working days.
                </>
              ) : (
                <>Nothing was charged for this booking, so there is no cancellation fee.</>
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-ink block mb-1">
                Reason for cancellation (optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Schedule changed, feeling better"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-blue600 focus:ring-2 focus:ring-blue100"
                data-testid="cancel-reason-input"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                className="flex-1"
                onClick={() => setCancelModalBooking(null)}
              >
                Keep booking
              </Button>
              <Button
                type="submit"
                variant="danger"
                className="flex-1"
                disabled={cancelling}
                data-testid="confirm-cancel-btn"
              >
                {cancelling ? 'Cancelling...' : 'Confirm cancellation'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Reschedule Booking Modal */}
      {rescheduleModalBooking && (
        <Modal
          isOpen={Boolean(rescheduleModalBooking)}
          onClose={() => setRescheduleModalBooking(null)}
          title="Reschedule booking"
        >
          <form
            onSubmit={handleRescheduleSubmit}
            className="space-y-4"
            data-testid="reschedule-booking-form"
          >
            {rescheduleError && (
              <div className="p-3 bg-red/10 border border-red/30 rounded-xl text-red text-xs font-semibold">
                {rescheduleError}
              </div>
            )}

            <p className="text-xs text-muted leading-relaxed">
              Rescheduling is free of charge. Choose a new date and time for your sample collection.
            </p>

            <div>
              <label className="text-xs font-bold text-ink block mb-1">New Date & Time</label>
              <input
                type="datetime-local"
                min={new Date(Date.now() + 30 * 60 * 1000).toISOString().slice(0, 16)}
                value={rescheduleSlot}
                onChange={(e) => setRescheduleSlot(e.target.value)}
                required
                className="w-full border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-blue600 focus:ring-2 focus:ring-blue100 bg-white"
                data-testid="reschedule-slot-input"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                className="flex-1"
                onClick={() => setRescheduleModalBooking(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                className="flex-1"
                disabled={rescheduling}
                data-testid="confirm-reschedule-btn"
              >
                {rescheduling ? 'Rescheduling...' : 'Confirm Reschedule'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
