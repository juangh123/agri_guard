import React, { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  MessageSquare,
  RefreshCw,
  Save,
  ShieldCheck,
  Wallet,
  XCircle,
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

function StatusBadge({ mode }) {
  if (mode === 'live') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> Live
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
      <XCircle className="h-3.5 w-3.5" /> Mock fallback
    </span>
  );
}

export default function SettingsPanel({ farms: _farms, onSaved }) {
  const [integrationStatus, setIntegrationStatus] = useState(null);
  const [selectedFarmId, setSelectedFarmId] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState('');
  const [testResult, setTestResult] = useState(null);

  const settingsFarms = integrationStatus?.farms || [];
  const selectedFarm = settingsFarms.find((farm) => String(farm.id) === String(selectedFarmId)) || settingsFarms[0];

  const fetchSettings = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/farms/settings/`);
      setIntegrationStatus(response.data);
      const firstFarm = response.data?.farms?.[0];
      if (firstFarm) {
        setSelectedFarmId(firstFarm.id);
        setPhoneNumber(firstFarm.phone_number || '');
        setWalletAddress(firstFarm.wallet_address || '');
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      toast.error('Unable to load settings.');
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (!selectedFarm) return;
    setPhoneNumber(selectedFarm.phone_number || '');
    setWalletAddress(selectedFarm.wallet_address || '');
  }, [selectedFarmId, integrationStatus, selectedFarm]);

  const handleSave = async () => {
    if (!selectedFarm) {
      toast.error('No farm selected. Register a farm first.');
      return;
    }
    setSaving(true);
    try {
      await axios.patch(`${API_BASE_URL}/farms/${selectedFarm.id}/`, {
        phone_number: phoneNumber,
        wallet_address: walletAddress,
      });
      toast.success('Farm contact and payout details saved.');
      await fetchSettings();
      onSaved?.();
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error(error.response?.data?.detail || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      toast.error('No Web3 wallet detected. Install MetaMask or paste an address manually.');
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts?.[0]) {
        setWalletAddress(accounts[0]);
        toast.success('Wallet connected.');
      }
    } catch (error) {
      console.error('Wallet connection failed:', error);
      toast.error('Wallet connection was rejected or failed.');
    }
  };

  const handleTestSms = async () => {
    if (!selectedFarm) return;
    setTesting('sms');
    setTestResult(null);
    try {
      const response = await axios.post(`${API_BASE_URL}/farms/${selectedFarm.id}/test_sms/`, {
        phone_number: phoneNumber,
      });
      setTestResult(response.data);
      toast.success('SMS test completed.');
    } catch (error) {
      console.error('SMS test failed:', error);
      setTestResult({ ok: false, error: error.response?.data?.error || error.message });
      toast.error('SMS test failed.');
    } finally {
      setTesting('');
    }
  };

  const handleTestWallet = async () => {
    if (!selectedFarm) return;
    setTesting('wallet');
    setTestResult(null);
    try {
      const response = await axios.post(`${API_BASE_URL}/farms/${selectedFarm.id}/test_wallet/`, {
        wallet_address: walletAddress,
      });
      setTestResult(response.data);
      toast.success('Wallet configuration test completed.');
    } catch (error) {
      console.error('Wallet test failed:', error);
      setTestResult({ ok: false, error: error.response?.data?.error || error.message });
      toast.error('Wallet test failed.');
    } finally {
      setTesting('');
    }
  };

  const smsMode = integrationStatus?.sms?.mode || 'mock';
  const web3Mode = integrationStatus?.web3?.mode || 'mock';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 space-y-6">
        <div className="glass-panel rounded-2xl p-6 shadow-lg border border-white/60">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 text-green-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Payout & Contact Configuration</h3>
              <p className="text-xs text-gray-500">These details are used by the alert and payout pipeline.</p>
            </div>
          </div>

          <label className="mb-2 block text-sm font-semibold text-gray-700">Farm</label>
          <select
            value={selectedFarm?.id || ''}
            onChange={(event) => setSelectedFarmId(event.target.value)}
            className="mb-4 w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-green-500/30"
          >
            {settingsFarms.map((farm) => (
              <option key={farm.id} value={farm.id}>{farm.name}</option>
            ))}
          </select>

          <label className="mb-2 block text-sm font-semibold text-gray-700">SMS Phone Number</label>
          <div className="relative mb-4">
            <MessageSquare className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="+254 700 000000"
              className="w-full rounded-xl border border-gray-200 bg-white/70 py-3 pl-10 pr-4 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-green-500/30"
            />
          </div>

          <label className="mb-2 block text-sm font-semibold text-gray-700">Payout Wallet Address</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Wallet className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={walletAddress}
                onChange={(event) => setWalletAddress(event.target.value)}
                placeholder="0x..."
                className="w-full rounded-xl border border-gray-200 bg-white/70 py-3 pl-10 pr-4 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-green-500/30"
              />
            </div>
            <button
              type="button"
              onClick={connectWallet}
              className="rounded-xl border border-gray-200 bg-white/70 px-4 text-sm font-bold text-gray-700 hover:bg-white"
            >
              Connect Wallet
            </button>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !selectedFarm}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-lg hover:from-green-600 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Settings
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <div className="glass-panel rounded-2xl p-6 shadow-lg border border-white/60">
          <h3 className="mb-4 text-lg font-bold text-gray-900">Integration Status</h3>
          <div className="space-y-4 text-sm text-gray-700">
            <div className="flex items-center justify-between">
              <span className="font-semibold">SMS / Twilio</span>
              <StatusBadge mode={smsMode} />
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold">Web3 / Payout</span>
              <StatusBadge mode={web3Mode} />
            </div>
            {integrationStatus?.web3?.configured && (
              <p className="rounded-xl bg-green-50 p-3 text-xs text-green-700">
                On-chain settlement is configured.
              </p>
            )}
            {!integrationStatus?.web3?.configured && (
              <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
                Payouts use the safe mock fallback until WEB3_PROVIDER_URI, WEB3_PRIVATE_KEY and SMART_CONTRACT_ADDRESS are set.
              </p>
            )}
            {!integrationStatus?.sms?.configured && (
              <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
                SMS uses the mock sender until TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER are set.
              </p>
            )}
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-6 shadow-lg border border-white/60">
          <h3 className="mb-4 text-lg font-bold text-gray-900">Connection Tests</h3>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleTestSms}
              disabled={testing === 'sms' || !selectedFarm}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {testing === 'sms' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Test SMS
            </button>
            <button
              type="button"
              onClick={handleTestWallet}
              disabled={testing === 'wallet' || !selectedFarm}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {testing === 'wallet' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Test Wallet Config
            </button>
          </div>

          {testResult && (
            <pre className="mt-4 overflow-x-auto rounded-xl bg-gray-900 p-4 text-xs text-green-300">
              {JSON.stringify(testResult, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
