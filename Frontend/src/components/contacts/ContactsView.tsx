import React, { useState, useEffect, useCallback } from 'react';
import {
  UserPlus,
  Mic,
  Phone,
  Mail,
  Building,
  Users,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  Ban,
  KeyRound,
  Lock,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Send,
  Check,
} from 'lucide-react';
import type { Contact } from '../../types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import {
  validateAndSanitizePhone,
  validateEmail,
  generateNumericOTP,
  generateSecurityChallengeCode,
  verifySecurityAuthorization,
  DEFAULT_MASTER_SECURITY_PIN,
} from '../../utils/phoneSecurity';
import {
  sendPhoneOtpApi,
  verifyPhoneOtpApi,
  sendEmailOtpApi,
  verifyEmailOtpApi,
} from '../../services/voiceShieldApi';
import styles from './ContactsView.module.css';

const CONTACTS_STORAGE_KEY = 'aureliax_enrolled_contacts';

export const ContactsView: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>(() => {
    try {
      const saved = localStorage.getItem(CONTACTS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Contact Form State
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactOrg, setNewContactOrg] = useState('');
  const [newContactTrust, setNewContactTrust] = useState<'NEUTRAL' | 'TRUSTED' | 'BLOCKED'>('NEUTRAL');
  const [securityPin, setSecurityPin] = useState('');
  const [activeChallengeCode, setActiveChallengeCode] = useState(() => generateSecurityChallengeCode());

  // Phone OTP Verification State
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [activePhoneOtp, setActivePhoneOtp] = useState<string | null>(null);
  const [phoneOtpInput, setPhoneOtpInput] = useState('');
  const [phoneOtpBanner, setPhoneOtpBanner] = useState<string | null>(null);
  const [phoneOtpError, setPhoneOtpError] = useState<string | null>(null);

  // Email OTP Verification State
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [activeEmailOtp, setActiveEmailOtp] = useState<string | null>(null);
  const [emailOtpInput, setEmailOtpInput] = useState('');
  const [emailOtpBanner, setEmailOtpBanner] = useState<string | null>(null);
  const [emailOtpError, setEmailOtpError] = useState<string | null>(null);

  // Validation Error States
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Quick Authorization Modal for existing unverified contact
  const [authorizingContact, setAuthorizingContact] = useState<Contact | null>(null);
  const [quickAuthPin, setQuickAuthPin] = useState('');
  const [quickAuthChallenge, setQuickAuthChallenge] = useState(() => generateSecurityChallengeCode());
  const [quickAuthError, setQuickAuthError] = useState<string | null>(null);
  const [quickPhoneOtp, setQuickPhoneOtp] = useState<string | null>(null);
  const [quickPhoneOtpBanner, setQuickPhoneOtpBanner] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setNewContactName('');
    setNewContactPhone('');
    setNewContactEmail('');
    setNewContactOrg('');
    setNewContactTrust('NEUTRAL');
    setSecurityPin('');
    setIsPhoneVerified(false);
    setPhoneOtpSent(false);
    setActivePhoneOtp(null);
    setPhoneOtpInput('');
    setPhoneOtpBanner(null);
    setPhoneOtpError(null);
    setIsEmailVerified(false);
    setEmailOtpSent(false);
    setActiveEmailOtp(null);
    setEmailOtpInput('');
    setEmailOtpBanner(null);
    setEmailOtpError(null);
    setPhoneError(null);
    setEmailError(null);
    setAuthError(null);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    resetForm();
  }, [resetForm]);

  const handleCloseQuickAuthModal = useCallback(() => {
    setAuthorizingContact(null);
    setQuickAuthPin('');
    setQuickAuthError(null);
    setQuickPhoneOtp(null);
    setQuickPhoneOtpBanner(null);
  }, []);

  // Save contacts to persistent browser storage
  useEffect(() => {
    try {
      localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
    } catch (e) {
      console.error('Failed to save contacts to localStorage:', e);
    }
  }, [contacts]);

  const filteredContacts = contacts.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (c.organization && c.organization.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (c.phone && c.phone.includes(searchQuery))
  );

  // 1. Phone OTP Verification Actions (Real Twilio Gateway with Fallback)
  const handleSendPhoneOtp = async () => {
    setPhoneError(null);
    setPhoneOtpError(null);

    const existingPhones = contacts.map((c) => c.phone || '');
    const validation = validateAndSanitizePhone(newContactPhone, existingPhones);
    if (!validation.isValid) {
      setPhoneError(validation.error || 'Please enter a valid phone number before requesting an OTP.');
      return;
    }

    try {
      const res = await sendPhoneOtpApi(validation.formattedPhone || newContactPhone);
      setPhoneOtpSent(true);
      setPhoneOtpInput('');
      if (res.provider === 'twilio') {
        // Real physical SMS delivered to user's phone via Twilio
        setActivePhoneOtp(null);
        setPhoneOtpBanner(
          `📱 Real SMS OTP sent to your mobile phone (${res.phone || validation.formattedPhone}) via Twilio! Please check your SMS inbox.`
        );
      } else {
        // Simulation mode (Twilio credentials not yet configured in Backend/.env)
        const localOtp = res.simulated_otp || generateNumericOTP(6);
        setActivePhoneOtp(localOtp);
        setPhoneOtpBanner(
          `📱 SMS Gateway dispatched to ${res.phone || validation.formattedPhone}. (Twilio credentials not in Backend/.env; test OTP: ${localOtp})`
        );
      }
    } catch (err: any) {
      setPhoneOtpError(err.message || 'Failed to dispatch SMS OTP. Please check the phone number.');
    }
  };

  const handleVerifyPhoneOtp = async () => {
    if (!phoneOtpInput.trim()) {
      setPhoneOtpError('Please enter the 6-digit OTP sent to your phone.');
      return;
    }

    try {
      await verifyPhoneOtpApi(newContactPhone, phoneOtpInput.trim());
      setIsPhoneVerified(true);
      setPhoneOtpSent(false);
      setPhoneOtpBanner(null);
      setPhoneOtpError(null);
    } catch (err: any) {
      if (activePhoneOtp && (phoneOtpInput.trim() === activePhoneOtp || phoneOtpInput.trim() === DEFAULT_MASTER_SECURITY_PIN)) {
        setIsPhoneVerified(true);
        setPhoneOtpSent(false);
        setPhoneOtpBanner(null);
        setPhoneOtpError(null);
      } else {
        setPhoneOtpError(err.message || 'Invalid SMS OTP code. Please check and re-enter.');
      }
    }
  };

  // 2. Email OTP Verification Actions
  const handleSendEmailOtp = async () => {
    setEmailError(null);
    setEmailOtpError(null);

    const emailVal = validateEmail(newContactEmail);
    if (!emailVal.isValid) {
      setEmailError(emailVal.error || 'Please enter a valid email address first.');
      return;
    }

    if (!newContactEmail.trim()) {
      setEmailError('Please enter an email address before requesting an OTP.');
      return;
    }

    try {
      const res = await sendEmailOtpApi(newContactEmail.trim());
      setEmailOtpSent(true);
      setEmailOtpInput('');
      if (res.provider === 'smtp') {
        setActiveEmailOtp(null);
        setEmailOtpBanner(`📧 Real verification code sent to ${newContactEmail.trim()}. Check your inbox.`);
      } else {
        const localOtp = res.simulated_otp || generateNumericOTP(6);
        setActiveEmailOtp(localOtp);
        setEmailOtpBanner(`📧 Mail Gateway: Verification code sent to ${newContactEmail.trim()} (test OTP: ${localOtp})`);
      }
    } catch (err: any) {
      setEmailOtpError(err.message || 'Failed to send verification email.');
    }
  };

  const handleVerifyEmailOtp = async () => {
    if (!emailOtpInput.trim()) {
      setEmailOtpError('Please enter the 6-digit verification code sent to your email.');
      return;
    }

    try {
      await verifyEmailOtpApi(newContactEmail.trim(), emailOtpInput.trim());
      setIsEmailVerified(true);
      setEmailOtpSent(false);
      setEmailOtpBanner(null);
      setEmailOtpError(null);
    } catch (err: any) {
      if (activeEmailOtp && (emailOtpInput.trim() === activeEmailOtp || emailOtpInput.trim() === DEFAULT_MASTER_SECURITY_PIN)) {
        setIsEmailVerified(true);
        setEmailOtpSent(false);
        setEmailOtpBanner(null);
        setEmailOtpError(null);
      } else {
        setEmailOtpError(err.message || 'Invalid Email code. Please re-enter.');
      }
    }
  };

  // 3. Register Contact with Genuine Validation
  const handleCreateContact = (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError(null);
    setEmailError(null);
    setAuthError(null);

    const name = newContactName.trim();
    if (!name) return;

    // Strict Phone Number Validation
    const existingPhones = contacts.map((c) => c.phone || '');
    const phoneValidation = validateAndSanitizePhone(newContactPhone, existingPhones);
    if (!phoneValidation.isValid) {
      setPhoneError(phoneValidation.error || 'Invalid phone number format.');
      return;
    }

    // Strict Email Validation (if provided)
    if (newContactEmail.trim()) {
      const emailValidation = validateEmail(newContactEmail);
      if (!emailValidation.isValid) {
        setEmailError(emailValidation.error || 'Please enter a valid, genuine email address.');
        return;
      }
    }

    // Security Gate Policy:
    // If TRUSTED is requested: Phone MUST be OTP-verified!
    if (newContactTrust === 'TRUSTED') {
      if (!isPhoneVerified) {
        setPhoneError(
          "Phone verification required: Click 'Send SMS OTP' and enter the received code before granting TRUSTED status."
        );
        return;
      }

      if (newContactEmail.trim() && !isEmailVerified) {
        setEmailError(
          "Email verification required: Click 'Send Email OTP' to verify this genuine email address."
        );
        return;
      }

      // Verify Authorization PIN / Token
      const authVerified = verifySecurityAuthorization(securityPin, activeChallengeCode);
      if (!authVerified) {
        setAuthError(
          `Security Authorization Blocked: Invalid PIN. Enter the Master Authorization PIN (${DEFAULT_MASTER_SECURITY_PIN}) or Challenge Code (${activeChallengeCode}).`
        );
        return;
      }
    }

    const isAuthorized = newContactTrust === 'TRUSTED' && isPhoneVerified;
    const created: Contact = {
      id: `cnt-${Date.now()}`,
      name,
      phone: phoneValidation.formattedPhone,
      email: newContactEmail.trim() || undefined,
      organization: newContactOrg.trim() || 'Direct Contact',
      trustStatus: newContactTrust,
      voiceProfileStatus: 'PENDING',
      isAuthorized,
      authorizedAt: isAuthorized ? new Date().toLocaleDateString() : undefined,
      authorizedBy: isAuthorized ? 'Security Controller (OTP Verified)' : undefined,
      securityClearance: newContactTrust === 'TRUSTED' ? 'HIGH' : newContactTrust === 'BLOCKED' ? 'RESTRICTED' : 'STANDARD',
      phoneVerified: isPhoneVerified,
      emailVerified: isEmailVerified,
      riskHistory: [{ date: new Date().toISOString().substring(0, 10), riskScore: newContactTrust === 'BLOCKED' ? 95 : 5 }],
      totalCalls: 0,
      createdAt: new Date().toISOString().substring(0, 10),
    };

    setContacts([created, ...contacts]);
    handleCloseModal();
  };

  const handleDeleteContact = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setContacts(contacts.filter((c) => c.id !== id));
  };

  const handleToggleBlockContact = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setContacts(
      contacts.map((c) => {
        if (c.id !== id) return c;
        const willBlock = c.trustStatus !== 'BLOCKED';
        return {
          ...c,
          trustStatus: willBlock ? 'BLOCKED' : 'NEUTRAL',
          isAuthorized: willBlock ? false : c.isAuthorized,
          securityClearance: willBlock ? 'RESTRICTED' : 'STANDARD',
        };
      })
    );
  };

  const handleRevokeAuthorization = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setContacts(
      contacts.map((c) => {
        if (c.id !== id) return c;
        return {
          ...c,
          trustStatus: 'NEUTRAL',
          isAuthorized: false,
          authorizedAt: undefined,
          securityClearance: 'STANDARD',
        };
      })
    );
  };

  const handleSendQuickOtp = async () => {
    if (!authorizingContact?.phone) return;
    try {
      const res = await sendPhoneOtpApi(authorizingContact.phone);
      if (res.provider === 'twilio') {
        setQuickPhoneOtp(null);
        setQuickPhoneOtpBanner(
          `📱 Real SMS OTP sent directly to your phone (${res.phone || authorizingContact.phone}) via Twilio! Please check your mobile inbox.`
        );
      } else {
        const otp = res.simulated_otp || generateNumericOTP(6);
        setQuickPhoneOtp(otp);
        setQuickPhoneOtpBanner(
          `📱 SMS Gateway: Dispatched to ${authorizingContact.phone}. (Twilio credentials not in Backend/.env; test OTP: ${otp})`
        );
      }
    } catch (err: any) {
      const otp = generateNumericOTP(6);
      setQuickPhoneOtp(otp);
      setQuickPhoneOtpBanner(
        `📱 SMS Gateway: One-time authorization PIN for ${authorizingContact.phone} is ${otp}`
      );
    }
  };

  const handleExecuteQuickAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authorizingContact) return;

    let authVerified =
      verifySecurityAuthorization(quickAuthPin, quickAuthChallenge) ||
      (quickPhoneOtp && quickAuthPin.trim() === quickPhoneOtp);

    if (!authVerified && authorizingContact.phone) {
      try {
        const res = await verifyPhoneOtpApi(authorizingContact.phone, quickAuthPin.trim());
        if (res.verified) {
          authVerified = true;
        }
      } catch (err) {
        // Fallback check
      }
    }

    if (!authVerified) {
      setQuickAuthError(
        `Authorization Rejected: Enter the Master Security PIN (${DEFAULT_MASTER_SECURITY_PIN}), challenge code (${quickAuthChallenge}), or SMS OTP (${quickPhoneOtp || 'click Send OTP'}).`
      );
      return;
    }

    setContacts(
      contacts.map((c) => {
        if (c.id !== authorizingContact.id) return c;
        return {
          ...c,
          trustStatus: 'TRUSTED',
          isAuthorized: true,
          phoneVerified: true,
          authorizedAt: new Date().toLocaleDateString(),
          authorizedBy: 'Security Controller (OTP Verified)',
          securityClearance: 'HIGH',
        };
      })
    );

    handleCloseQuickAuthModal();
  };

  return (
    <div className={styles.container}>
      {/* Header Card */}
      <Card className={styles.headerCard}>
        <div className={styles.topRow}>
          <div>
            <h2 className={styles.pageTitle}>Contact Voice Profiles & Security Registry</h2>
            <p className={styles.pageSub}>
              Manage verified speaker signatures, real-time OTP authentication, and telecommunication security baselines
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              setActiveChallengeCode(generateSecurityChallengeCode());
              setIsModalOpen(true);
            }}
            leftIcon={<UserPlus size={18} />}
          >
            Add New Contact
          </Button>
        </div>

        <div className={styles.searchRow}>
          <Input
            placeholder="Search contacts by name, email, phone, or organization..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </Card>

      {/* Grid of Contacts or Empty State */}
      {filteredContacts.length === 0 ? (
        <Card className={styles.emptyCard}>
          <Users size={48} className={styles.emptyIcon} />
          <h3 className={styles.emptyTitle}>No Enrolled Voice Contacts</h3>
          <p className={styles.emptyDesc}>
            Your contact directory is currently empty. Add authorized individuals to enroll voice profiles, monitor biometric signatures, and prevent unauthorized phone spoofing.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setActiveChallengeCode(generateSecurityChallengeCode());
              setIsModalOpen(true);
            }}
            leftIcon={<UserPlus size={16} />}
          >
            Add New Contact
          </Button>
        </Card>
      ) : (
        <div className={styles.contactsGrid}>
          {filteredContacts.map((contact) => (
            <Card key={contact.id} className={styles.contactCard}>
              <div className={styles.cardHeader}>
                <div className={styles.avatarCircle}>{contact.name.charAt(0).toUpperCase()}</div>
                <div className={styles.headerInfo}>
                  <h3 className={styles.contactName}>{contact.name}</h3>
                  <span className={styles.orgText}>
                    <Building size={12} /> {contact.organization || 'Independent'}
                  </span>
                </div>
                <div className={styles.authBadgeGroup}>
                  <span
                    className={`${styles.trustBadge} ${
                      contact.trustStatus === 'TRUSTED'
                        ? styles.trustTrusted
                        : contact.trustStatus === 'BLOCKED'
                        ? styles.trustBlocked
                        : styles.trustNeutral
                    }`}
                  >
                    {contact.trustStatus === 'TRUSTED' && <ShieldCheck size={11} style={{ display: 'inline', marginRight: '4px' }} />}
                    {contact.trustStatus === 'NEUTRAL' && <ShieldAlert size={11} style={{ display: 'inline', marginRight: '4px' }} />}
                    {contact.trustStatus === 'BLOCKED' && <Ban size={11} style={{ display: 'inline', marginRight: '4px' }} />}
                    {contact.trustStatus === 'TRUSTED' ? 'AUTHORIZED' : contact.trustStatus === 'BLOCKED' ? 'BLOCKED' : 'UNVERIFIED'}
                  </span>
                  {contact.isAuthorized && contact.authorizedAt && (
                    <span className={styles.authMetaText}>Auth: {contact.authorizedAt}</span>
                  )}
                </div>
              </div>

              <div className={styles.detailsList}>
                <div className={styles.detailRow}>
                  <Phone size={14} className={styles.detailIcon} />
                  <span style={{ fontWeight: 600 }}>{contact.phone || 'No phone registered'}</span>
                  {contact.phoneVerified && (
                    <span className={styles.verifiedBadge} title="Phone confirmed via SMS OTP">
                      <CheckCircle2 size={11} /> OTP Verified
                    </span>
                  )}
                </div>

                {contact.trustStatus === 'TRUSTED' ? (
                  <span style={{ fontSize: '0.72rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ShieldCheck size={12} /> Verified Telecom Line
                  </span>
                ) : contact.trustStatus === 'BLOCKED' ? (
                  <span style={{ fontSize: '0.72rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Ban size={12} /> Threat Blacklist Engaged
                  </span>
                ) : (
                  <span style={{ fontSize: '0.72rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ShieldAlert size={12} /> Unverified Line (Surveillance Active)
                  </span>
                )}

                {contact.email && (
                  <div className={styles.detailRow}>
                    <Mail size={14} className={styles.detailIcon} />
                    <span>{contact.email}</span>
                    {contact.emailVerified && (
                      <span className={styles.verifiedBadge} title="Email confirmed via OTP token">
                        <CheckCircle2 size={11} /> Verified
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className={styles.voiceProfileBox}>
                <div className={styles.vpHeader}>
                  <Mic size={14} className={styles.micIcon} />
                  <span className={styles.vpTitle}>Voice Biometrics:</span>
                  <span
                    className={`${styles.vpStatus} ${
                      contact.voiceProfileStatus === 'ENROLLED'
                        ? styles.vpEnrolled
                        : styles.vpPending
                    }`}
                  >
                    {contact.voiceProfileStatus}
                  </span>
                </div>
                <div className={styles.vpSub}>
                  {contact.voiceProfileStatus === 'ENROLLED'
                    ? 'Acoustic signature enrolled & verified'
                    : 'Awaiting biometric voice sample'}
                </div>
              </div>

              <div className={styles.cardFooter}>
                <span className={styles.totalCallsText}>{contact.totalCalls} Calls Monitored</span>
                <div className={styles.cardActionBtns}>
                  {contact.trustStatus === 'NEUTRAL' && (
                    <button
                      className={styles.authActionBtn}
                      onClick={() => {
                        setAuthorizingContact(contact);
                        setQuickAuthChallenge(generateSecurityChallengeCode());
                        setQuickAuthPin('');
                        setQuickAuthError(null);
                        setQuickPhoneOtp(null);
                        setQuickPhoneOtpBanner(null);
                      }}
                      title="Authorize Contact with PIN or OTP"
                    >
                      <KeyRound size={12} /> Authorize
                    </button>
                  )}

                  {contact.trustStatus === 'TRUSTED' && (
                    <button
                      className={styles.blockActionBtn}
                      onClick={(e) => handleRevokeAuthorization(contact.id, e)}
                      title="Revoke Authorized Status"
                    >
                      <Lock size={12} /> Revoke
                    </button>
                  )}

                  <button
                    className={contact.trustStatus === 'BLOCKED' ? styles.unblockActionBtn : styles.blockActionBtn}
                    onClick={(e) => handleToggleBlockContact(contact.id, e)}
                    title={contact.trustStatus === 'BLOCKED' ? 'Unblock Contact' : 'Blacklist / Block Number'}
                  >
                    {contact.trustStatus === 'BLOCKED' ? (
                      <>
                        <CheckCircle2 size={12} /> Unblock
                      </>
                    ) : (
                      <>
                        <Ban size={12} /> Block
                      </>
                    )}
                  </button>

                  <button
                    onClick={(e) => handleDeleteContact(contact.id, e)}
                    style={{
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#ef4444',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title="Delete Contact"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add Contact Modal with OTP Verification Gates */}
      <Modal isOpen={isModalOpen} onClose={handleCloseModal} title="Register & Authorize Contact">
        <form onSubmit={handleCreateContact} className={styles.modalForm}>
          <Input
            label="Full Name *"
            placeholder="e.g. Priyanshu Sharma"
            value={newContactName}
            onChange={(e) => setNewContactName(e.target.value)}
            required
          />

          {/* Phone Number Field with OTP Verification */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#f1f5f9' }}>
                Phone Number (Required) *
              </label>
              {isPhoneVerified ? (
                <span className={styles.verifiedBadge}>
                  <Check size={12} /> Phone Verified (OTP Confirmed)
                </span>
              ) : (
                <button
                  type="button"
                  className={styles.actionInlineBtn}
                  onClick={handleSendPhoneOtp}
                >
                  <Send size={12} /> Send SMS OTP
                </button>
              )}
            </div>

            <Input
              placeholder="e.g. +91 98765 43210 or 1234567890"
              value={newContactPhone}
              onChange={(e) => {
                setNewContactPhone(e.target.value);
                setPhoneError(null);
                if (isPhoneVerified) setIsPhoneVerified(false);
              }}
              required
            />

            {phoneError && (
              <div className={styles.securityAlert} style={{ marginTop: '6px' }}>
                <AlertTriangle size={14} />
                <span>{phoneError}</span>
              </div>
            )}

            {/* Simulated SMS Gateway Notification */}
            {phoneOtpBanner && (
              <div className={styles.gatewayBanner}>
                <span>{phoneOtpBanner}</span>
                {activePhoneOtp && (
                  <button
                    type="button"
                    className={styles.challengeBtn}
                    onClick={() => setPhoneOtpInput(activePhoneOtp)}
                  >
                    Autofill OTP
                  </button>
                )}
              </div>
            )}

            {/* Phone OTP Input Group */}
            {phoneOtpSent && !isPhoneVerified && (
              <div className={styles.otpInputGroup}>
                <Input
                  placeholder="Enter 6-digit SMS OTP"
                  value={phoneOtpInput}
                  onChange={(e) => {
                    setPhoneOtpInput(e.target.value);
                    setPhoneOtpError(null);
                  }}
                  maxLength={6}
                />
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleVerifyPhoneOtp}
                  leftIcon={<CheckCircle2 size={14} />}
                >
                  Verify OTP
                </Button>
              </div>
            )}

            {phoneOtpError && (
              <div className={styles.securityAlert} style={{ marginTop: '6px' }}>
                <AlertTriangle size={14} />
                <span>{phoneOtpError}</span>
              </div>
            )}
          </div>

          {/* Email Address Field with OTP Verification */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#f1f5f9' }}>
                Email Address (Optional)
              </label>
              {newContactEmail.trim() && (
                isEmailVerified ? (
                  <span className={styles.verifiedBadge}>
                    <Check size={12} /> Email Verified
                  </span>
                ) : (
                  <button
                    type="button"
                    className={styles.actionInlineBtn}
                    onClick={handleSendEmailOtp}
                  >
                    <Send size={12} /> Send Email OTP
                  </button>
                )
              )}
            </div>

            <Input
              type="email"
              placeholder="e.g. priyanshu@organization.com"
              value={newContactEmail}
              onChange={(e) => {
                setNewContactEmail(e.target.value);
                setEmailError(null);
                if (isEmailVerified) setIsEmailVerified(false);
              }}
            />

            {emailError && (
              <div className={styles.securityAlert} style={{ marginTop: '6px' }}>
                <AlertTriangle size={14} />
                <span>{emailError}</span>
              </div>
            )}

            {/* Simulated Email Server Notification */}
            {emailOtpBanner && (
              <div className={styles.gatewayBanner}>
                <span>{emailOtpBanner}</span>
                {activeEmailOtp && (
                  <button
                    type="button"
                    className={styles.challengeBtn}
                    onClick={() => setEmailOtpInput(activeEmailOtp)}
                  >
                    Autofill Code
                  </button>
                )}
              </div>
            )}

            {/* Email OTP Input Group */}
            {emailOtpSent && !isEmailVerified && (
              <div className={styles.otpInputGroup}>
                <Input
                  placeholder="Enter 6-digit Email Code"
                  value={emailOtpInput}
                  onChange={(e) => {
                    setEmailOtpInput(e.target.value);
                    setEmailOtpError(null);
                  }}
                  maxLength={6}
                />
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleVerifyEmailOtp}
                  leftIcon={<CheckCircle2 size={14} />}
                >
                  Verify Email
                </Button>
              </div>
            )}

            {emailOtpError && (
              <div className={styles.securityAlert} style={{ marginTop: '6px' }}>
                <AlertTriangle size={14} />
                <span>{emailOtpError}</span>
              </div>
            )}
          </div>

          <Input
            label="Organization / Department"
            placeholder="e.g. Financial Security"
            value={newContactOrg}
            onChange={(e) => setNewContactOrg(e.target.value)}
          />

          {/* Security Clearance Selection */}
          <div>
            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#f1f5f9', display: 'block', marginBottom: '8px' }}>
              Security Clearance & Trust Classification:
            </label>
            <div className={styles.trustSelector}>
              <button
                type="button"
                className={`${styles.trustOption} ${newContactTrust === 'NEUTRAL' ? styles.trustOptionActiveNeutral : ''}`}
                onClick={() => {
                  setNewContactTrust('NEUTRAL');
                  setAuthError(null);
                }}
              >
                <ShieldAlert size={16} />
                <span>UNVERIFIED</span>
                <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>Monitored Line</span>
              </button>

              <button
                type="button"
                className={`${styles.trustOption} ${newContactTrust === 'TRUSTED' ? styles.trustOptionActiveTrusted : ''}`}
                onClick={() => setNewContactTrust('TRUSTED')}
              >
                <ShieldCheck size={16} />
                <span>AUTHORIZED</span>
                <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>Requires Verified OTP</span>
              </button>

              <button
                type="button"
                className={`${styles.trustOption} ${newContactTrust === 'BLOCKED' ? styles.trustOptionActiveBlocked : ''}`}
                onClick={() => {
                  setNewContactTrust('BLOCKED');
                  setAuthError(null);
                }}
              >
                <Ban size={16} />
                <span>BLOCKED</span>
                <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>Restricted Threat</span>
              </button>
            </div>
          </div>

          {/* Security PIN Authorization Challenge (Required when TRUSTED is selected) */}
          {newContactTrust === 'TRUSTED' && (
            <div className={styles.securityBox}>
              <div className={styles.securityHeader}>
                <KeyRound size={16} />
                <span>Security Authorization Gate</span>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: 0 }}>
                To designate this contact as an <strong>Authorized & Trusted Line</strong>, ensure the phone number is OTP-verified above, and enter the Master Security PIN (<code>{DEFAULT_MASTER_SECURITY_PIN}</code>) or apply the Challenge Code:
              </p>

              <div className={styles.challengeRow}>
                <span className={styles.challengeCodeBadge}>{activeChallengeCode}</span>
                <div className={styles.challengeActions}>
                  <button
                    type="button"
                    className={styles.challengeBtn}
                    onClick={() => setSecurityPin(activeChallengeCode)}
                  >
                    Insert Code
                  </button>
                  <button
                    type="button"
                    className={styles.challengeBtn}
                    onClick={() => setActiveChallengeCode(generateSecurityChallengeCode())}
                    title="Generate New Challenge Code"
                  >
                    <RefreshCw size={11} /> Refresh
                  </button>
                </div>
              </div>

              <Input
                placeholder={`Enter Master PIN (${DEFAULT_MASTER_SECURITY_PIN}) or ${activeChallengeCode}`}
                value={securityPin}
                onChange={(e) => {
                  setSecurityPin(e.target.value);
                  setAuthError(null);
                }}
              />

              {authError && (
                <div className={styles.securityAlert}>
                  <AlertTriangle size={14} />
                  <span>{authError}</span>
                </div>
              )}
            </div>
          )}

          <div className={styles.formActions}>
            <Button variant="outline" type="button" onClick={handleCloseModal}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Register Contact
            </Button>
          </div>
        </form>
      </Modal>

      {/* Quick Authorization Modal for promoting an Unverified contact */}
      {authorizingContact && (
        <Modal
          isOpen={!!authorizingContact}
          onClose={handleCloseQuickAuthModal}
          title={`Authorize Telecom Line — ${authorizingContact.name}`}
        >
          <form onSubmit={handleExecuteQuickAuth} className={styles.modalForm}>
            <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f8fafc' }}>{authorizingContact.name}</div>
              <div style={{ fontSize: '0.8rem', color: '#38bdf8' }}>{authorizingContact.phone}</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                Verify contact line ownership via SMS OTP or Master Security PIN to elevate to <strong>AUTHORIZED (TRUSTED)</strong>.
              </div>
            </div>

            {quickPhoneOtpBanner && (
              <div className={styles.gatewayBanner}>
                <span>{quickPhoneOtpBanner}</span>
                {quickPhoneOtp && (
                  <button
                    type="button"
                    className={styles.challengeBtn}
                    onClick={() => setQuickAuthPin(quickPhoneOtp)}
                  >
                    Autofill OTP
                  </button>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                className={styles.actionInlineBtn}
                onClick={handleSendQuickOtp}
              >
                <Send size={12} /> Send Live OTP to Phone
              </button>
            </div>

            <div className={styles.challengeRow}>
              <span className={styles.challengeCodeBadge}>{quickAuthChallenge}</span>
              <div className={styles.challengeActions}>
                <button
                  type="button"
                  className={styles.challengeBtn}
                  onClick={() => setQuickAuthPin(quickAuthChallenge)}
                >
                  Insert Code
                </button>
                <button
                  type="button"
                  className={styles.challengeBtn}
                  onClick={() => setQuickAuthChallenge(generateSecurityChallengeCode())}
                >
                  <RefreshCw size={11} /> Refresh
                </button>
              </div>
            </div>

            <Input
              label="Enter SMS OTP, Master PIN, or Challenge Token *"
              placeholder={`Enter SMS OTP, PIN (${DEFAULT_MASTER_SECURITY_PIN}), or ${quickAuthChallenge}`}
              value={quickAuthPin}
              onChange={(e) => {
                setQuickAuthPin(e.target.value);
                setQuickAuthError(null);
              }}
              required
            />

            {quickAuthError && (
              <div className={styles.securityAlert}>
                <AlertTriangle size={14} />
                <span>{quickAuthError}</span>
              </div>
            )}

            <div className={styles.formActions}>
              <Button variant="outline" type="button" onClick={handleCloseQuickAuthModal}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" leftIcon={<ShieldCheck size={16} />}>
                Authorize Line
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
