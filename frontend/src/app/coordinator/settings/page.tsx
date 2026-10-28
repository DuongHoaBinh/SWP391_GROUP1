'use client';

import React, { useState, useEffect } from 'react';
import { User, KeyRound, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getCurrentUser } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import toast from 'react-hot-toast';

export default function CoordinatorSettingsPage() {
  const [profile, setProfile] = useState({ fullName: '', email: '', phone: '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPass, setIsChangingPass] = useState(false);

  useEffect(() => {
    const u = getCurrentUser();
    setProfile({
      fullName: u.name || u.fullName || 'Fleet & Route Coordinator',
      email: u.email || 'coordinator@example.com',
      phone: u.phone || '0918889999',
    });
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await apiClient('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ fullName: profile.fullName, phone: profile.phone }),
      });
      toast.success('Coordinator profile updated!');
    } catch {
      toast.error('Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    setIsChangingPass(true);
    try {
      await apiClient('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(passwords),
      });
      toast.success('Password updated successfully!');
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch {
      toast.error('Failed to change password.');
    } finally {
      setIsChangingPass(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 pb-12 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 m-0">Coordinator Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Manage dispatch operator credentials and notification options.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
          <User size={18} className="text-blue-600" /> Coordinator Profile Details
        </h3>
        <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Full Name</label>
              <input 
                type="text" 
                value={profile.fullName} 
                onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Phone Number</label>
              <input 
                type="text" 
                value={profile.phone} 
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Email</label>
            <input 
              type="email" 
              disabled 
              value={profile.email} 
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 text-sm"
            />
          </div>
          <div className="flex justify-end mt-2">
            <Button type="submit" variant="primary" size="sm" disabled={isSaving}>
              <Save size={16} className="mr-1.5" /> {isSaving ? 'Saving...' : 'Save Profile'}
            </Button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
          <KeyRound size={18} className="text-blue-600" /> Change Security Password
        </h3>
        <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Current Password</label>
            <input 
              type="password" 
              value={passwords.currentPassword} 
              onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">New Password</label>
              <input 
                type="password" 
                value={passwords.newPassword} 
                onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Confirm New Password</label>
              <input 
                type="password" 
                value={passwords.confirmPassword} 
                onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div className="flex justify-end mt-2">
            <Button type="submit" variant="primary" size="sm" disabled={isChangingPass}>
              <KeyRound size={16} className="mr-1.5" /> {isChangingPass ? 'Updating...' : 'Update Password'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
