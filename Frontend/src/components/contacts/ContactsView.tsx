import React, { useState } from 'react';
import { UserPlus, Mic, Phone, Mail, Building } from 'lucide-react';
import type { Contact } from '../../types';
import { MOCK_CONTACTS } from '../../services/mockData';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import styles from './ContactsView.module.css';

export const ContactsView: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>(MOCK_CONTACTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');

  const filteredContacts = contacts.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (c.organization && c.organization.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleCreateContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContactName) return;

    const created: Contact = {
      id: `cnt-${Date.now()}`,
      name: newContactName,
      phone: newContactPhone || '+91 90000 00000',
      trustStatus: 'TRUSTED',
      voiceProfileStatus: 'PENDING',
      riskHistory: [{ date: new Date().toISOString().substring(0, 10), riskScore: 10 }],
      totalCalls: 0,
      createdAt: new Date().toISOString().substring(0, 10),
    };

    setContacts([created, ...contacts]);
    setNewContactName('');
    setNewContactPhone('');
    setIsModalOpen(false);
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

      {/* Grid of Contacts */}
      <div className={styles.contactsGrid}>
        {filteredContacts.map((contact) => (
          <Card key={contact.id} className={styles.contactCard}>
            <div className={styles.cardHeader}>
              <div className={styles.avatarCircle}>{contact.name.charAt(0)}</div>
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
              <button className={styles.enrollBtn}>
                {contact.voiceProfileStatus === 'ENROLLED' ? 'Re-enroll' : 'Enroll Biometrics'}
              </button>
            </div>
          </Card>
        ))}
      </div>

      {/* Add Contact Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Register New Contact">
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
