import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
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

function StatusBadge({ mode, liveLabel, mockLabel }) {
  if (mode === 'live') {
    return (
      <span className="status-chip bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
        <CheckCircle2 className="h-3.5 w-3.5" /> {liveLabel}
      </span>
    );
  }
  return (
    <span className="status-chip bg-amber-500/10 text-amber-600 border-amber-500/30">
      <XCircle className="h-3.5 w-3.5" /> {mockLabel}
    </span>
  );
}

export default function SettingsPanel({ farms = [], onSaved }) {
  const { t } = useTranslation();
  const [integrationStatus, setIntegrationStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedFarmId, setSelectedFarmId] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState('');
  const [testResult, setTestResult] = useState(null);

  const dashboardFarmOptions = useMemo(
    () => farms.map((farm) => ({
      id: farm.id,
      name: farm.properties?.name || farm.name || `Farm #${farm.id}`,
      phone_number: farm.properties?.phone_number || '',
      wallet_address: farm.properties?.wallet_address || '',
      crop_type: farm.properties?.crop_type || '',
    })),
    [farms]
  );
  const settingsFarms = useMemo(
    () => integrationStatus?.farms?.length ? integrationStatus.farms : dashboardFarmOptions,
    [dashboardFarmOptions, integrationStatus]
  );
  const selectedFarm = useMemo(
    () => settingsFarms.find((farm) => String(farm.id) === String(selectedFarmId)) || settingsFarms[0],
    [selectedFarmId, settingsFarms]
  );

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await axios.get(`${API_BASE_URL}/farms/integration_status/`);
      setIntegrationStatus(response.data);
      const firstFarm = response.data?.farms?.[0];
      const currentSelectionStillExists = response.data?.farms?.some(
        (farm) => String(farm.id) === String(selectedFarmId)
      );
      if (firstFarm && !currentSelectionStillExists) {
        setSelectedFarmId(String(firstFarm.id));
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      setLoadError(true);
      toast.error(t('settings_load_failed'));
    } finally {
      setLoading(false);
    }
  }, [selectedFarmId, t]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    const nextFarm = settingsFarms.find((farm) => String(farm.id) === String(selectedFarmId)) || settingsFarms[0];
    if (!nextFarm) return;
    setPhoneNumber(nextFarm.phone_number || '');
    setWalletAddress(nextFarm.wallet_address || '');
  }, [selectedFarmId, settingsFarms]);

  const handleSave = async () => {
    if (!selectedFarm) {
      toast.error(t('toast_no_farm'));
      return;
    }
    setSaving(true);
    try {
      await axios.patch(`${API_BASE_URL}/farms/${selectedFarm.id}/`, {
        phone_number: phoneNumber,
        wallet_address: walletAddress,
      });
      toast.success(t('toast_settings_saved'));
      await fetchSettings();
      onSaved?.();
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error(error.response?.data?.detail || t('toast_settings_failed'));
    } finally {
      setSaving(false);
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      toast.error(t('toast_no_wallet'));
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts?.[0]) {
        setWalletAddress(accounts[0]);
        toast.success(t('toast_wallet_connected'));
      }
    } catch (error) {
      console.error('Wallet connection failed:', error);
      toast.error(t('toast_wallet_rejected'));
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
      if (response.data.mode === 'live') {
        toast.success(t('toast_sms_live'));
      } else {
        toast(t('toast_sms_mock'), { icon: '📱' });
      }
    } catch (error) {
      console.error('SMS test failed:', error);
      setTestResult({ ok: false, error: error.response?.data?.error || error.message });
      toast.error(t('toast_sms_failed'));
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
      if (response.data.mode === 'live') {
        toast.success(t('toast_wallet_live'));
      } else {
        toast(t('toast_wallet_mock'), { icon: '🔗' });
      }
    } catch (error) {
      console.error('Wallet test failed:', error);
      setTestResult({ ok: false, error: error.response?.data?.error || error.message });
      toast.error(t('toast_wallet_failed'));
    } finally {
      setTesting('');
    }
  };

  const smsMode = integrationStatus?.sms?.mode || 'mock';
  const web3Mode = integrationStatus?.web3?.mode || 'mock';

  const inputClass =
    'w-full rounded-xl border border-input bg-card py-3 ps-10 pe-4 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary transition-colors';

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="me-2 h-5 w-5 animate-spin" />
        {t('settings_loading')}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="card-surface p-6 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-500" />
        <p className="text-sm font-semibold text-foreground">{t('settings_load_failed')}</p>
        <button
          type="button"
          onClick={fetchSettings}
          className="mt-4 rounded-xl border border-border bg-muted px-4 py-2 text-sm font-bold text-foreground hover:bg-muted/70"
        >
          {t('retry')}
        </button>
      </div>
    );
  }

  if (settingsFarms.length === 0) {
    return (
      <div className="card-surface p-8 text-center">
        <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-primary" />
        <h3 className="text-lg font-bold text-foreground">{t('no_farms_title')}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{t('no_farms_desc')}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 space-y-6">
        <div className="card-surface p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">{t('payout_contact_title')}</h3>
              <p className="text-xs text-muted-foreground">{t('payout_contact_desc')}</p>
            </div>
          </div>

          <label className="mb-2 block text-sm font-bold text-foreground">{t('overview_table_farm')}</label>
          <select
            value={String(selectedFarm?.id || '')}
            onChange={(event) => setSelectedFarmId(String(event.target.value))}
            className="mb-4 w-full rounded-xl border border-input bg-card px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/40"
          >
            {settingsFarms.map((farm) => (
              <option key={farm.id} value={farm.id}>{farm.name}</option>
            ))}
          </select>

          <label className="mb-2 block text-sm font-bold text-foreground">{t('phone_label')}</label>
          <div className="relative mb-4">
            <MessageSquare className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="+254 700 000000"
              className={inputClass}
            />
          </div>

          <label className="mb-2 block text-sm font-bold text-foreground">{t('wallet_address_label')}</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Wallet className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={walletAddress}
                onChange={(event) => setWalletAddress(event.target.value)}
                placeholder="0x..."
                className={inputClass}
              />
            </div>
            <button
              type="button"
              onClick={connectWallet}
              className="rounded-xl border border-border bg-muted px-4 text-sm font-bold text-foreground hover:bg-muted/70"
            >
              {t('connect_wallet')}
            </button>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !selectedFarm}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground shadow-md hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t('save_changes')}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <div className="card-surface p-6">
          <h3 className="mb-4 text-lg font-bold text-foreground">{t('integration_status_title')}</h3>
          <div className="space-y-4 text-sm text-foreground">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{t('sms_channel_label')}</span>
              <StatusBadge mode={smsMode} liveLabel={t('status_live')} mockLabel={t('status_mock')} />
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold">{t('web3_channel_label')}</span>
              <StatusBadge mode={web3Mode} liveLabel={t('status_live')} mockLabel={t('status_mock')} />
            </div>
            {integrationStatus?.web3?.configured && (
              <p className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-600">
                {t('web3_configured_msg')}
              </p>
            )}
            {!integrationStatus?.web3?.configured && (
              <p className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-600">
                {t('web3_mock_msg')}
              </p>
            )}
            {!integrationStatus?.sms?.configured && (
              <p className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-600">
                {t('sms_mock_msg')}
              </p>
            )}
          </div>
        </div>

        <div className="card-surface p-6">
          <h3 className="mb-4 text-lg font-bold text-foreground">{t('connection_tests_title')}</h3>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleTestSms}
              disabled={testing === 'sms' || !selectedFarm}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-muted px-4 py-3 text-sm font-bold text-foreground hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {testing === 'sms' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t('test_sms')}
            </button>
            <button
              type="button"
              onClick={handleTestWallet}
              disabled={testing === 'wallet' || !selectedFarm}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-muted px-4 py-3 text-sm font-bold text-foreground hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {testing === 'wallet' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              {t('test_wallet')}
            </button>
          </div>

          {testResult && (
            <pre className="mt-4 overflow-x-auto rounded-xl bg-gray-900 p-4 text-xs text-emerald-300 scrollbar-thin">
              {JSON.stringify(testResult, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
