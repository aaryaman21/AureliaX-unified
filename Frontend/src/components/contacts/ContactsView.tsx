import React, { useState, useEffect } from 'react';
import { UserPlus, Mic, Phone, Mail, Building, Users, Trash2 } from 'lucide-react';
import type { Contact } from '../../types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
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
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactOrg, setNewContactOrg] = useState('');

  const handleCloseModal = React.useCallback(() => {
    setIsModalOpen(false);
  }, []);

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

  const handleCreateContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContactName.trim()) return;

    const created: Contact = {
      id: `cnt-${Date.now()}`,
      name: newContactName.trim(),
      phone: newContactPhone.trim() || '+91 90000 00000',
      email: newContactEmail.trim() || undefined,
      organization: newContactOrg.trim() || 'Direct Contact',
      trustStatus: 'TRUSTED',
      voiceProfileStatus: 'PENDING',
      riskHistory: [{ date: new Date().toISOString().substring(0, 10), riskScore: 5 }],
      totalCalls: 0,
      createdAt: new Date().toISOString().substring(0, 10),
    };

    setContacts([created, ...contacts]);
    setNewContactName('');
    setNewContactPhone('');
    setNewContactEmail('');
    setNewContactOrg('');
    setIsModalOpen(false);
  };

  const handleDeleteContact = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setContacts(contacts.filter((c) => c.id !== id));
  };

  return (
    <div className={styles.container}>
      {/* Header Card */}
      <Card className={styles.headerCard}>
        <div className={styles.topRow}>
          <div>
            <h2 className={styles.pageTitle}>Contact Voice Profiles & Trust Directory</h2>
            <p className={styles.pageSub}>
              Manage enrolled speaker signatures, trust levels, and biometric voice profile verification
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            onClick={() => setIsModalOpen(true)}
            leftIcon={<UserPlus size={18} />}
          >
            Add New Contact
          </Button>
        </div>

        <div className={styles.searchRow}>
          <Input
            placeholder="Search contacts by name, email, or organization..."
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
            Your contact directory is currently empty. Add trusted individuals to enroll voice profiles, monitor biometric signatures, and establish identity verification baselines.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsModalOpen(true)}
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
                <span
                  className={`${styles.trustBadge} ${
                    contact.trustStatus === 'TRUSTED'
                      ? styles.trustTrusted
                      : contact.trustStatus === 'BLOCKED'
                      ? styles.trustBlocked
                      : styles.trustNeutral
                  }`}
                >
                  {contact.trustStatus}
                </span>
              </div>

              <div className={styles.detailsList}>
                <div className={styles.detailRow}>
                  <Phone size={14} className={styles.detailIcon} />
                  <span>{contact.phone || 'No phone number'}</span>
                </div>
                {contact.email && (
                  <div className={styles.detailRow}>
                    <Mail size={14} className={styles.detailIcon} />
                    <span>{contact.email}</span>
                  </div>
                )}
              </div>

              <div className={styles.voiceProfileBox}>
                <div className={styles.vpHeader}>
                  <Mic size={14} className={styles.micIcon} />
                  <span className={styles.vpTitle}>Voice Profile:</span>
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
                    ? 'Acoustic fingerprint registered & verified'
                    : 'Enrollment audio sample required'}
                </div>
              </div>

              <div className={styles.cardFooter}>
                <span className={styles.totalCallsText}>{contact.totalCalls} Calls Analyzed</span>
                <div style={{ display: 'flex', gap: '8px' }}>
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
                  <button className={styles.enrollBtn}>
                    {contact.voiceProfileStatus === 'ENROLLED' ? 'Re-enroll' : 'Enroll Biometrics'}
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add Contact Modal */}
      <Modal isOpen={isModalOpen} onClose={handleCloseModal} title="Register New Contact">
        <form onSubmit={handleCreateContact} className={styles.modalForm}>
          <Input
            label="Full Name"
            placeholder="e.g. Priyanshu Sharma"
            value={newContactName}
            onChange={(e) => setNewContactName(e.target.value)}
            required
          />
          <Input
            label="Phone Number"
            placeholder="e.g. +91 98765 00000"
            value={newContactPhone}
            onChange={(e) => setNewContactPhone(e.target.value)}
          />
          <Input
            label="Email Address"
            type="email"
            placeholder="e.g. priyanshu@example.com"
            value={newContactEmail}
            onChange={(e) => setNewContactEmail(e.target.value)}
          />
          <Input
            label="Organization"
            placeholder="e.g. Finance Operations / Security"
            value={newContactOrg}
            onChange={(e) => setNewContactOrg(e.target.value)}
          />
          <div className={styles.formActions}>
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Save Contact
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
