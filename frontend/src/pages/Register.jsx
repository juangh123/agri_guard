import React, { useState } from 'react';
import axios from 'axios';
import { ShieldAlert, MapPin, Send, CheckCircle2, User, Phone, ArrowLeft, Shield, Lock, Sprout } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

const Register = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    phone_number: '',
    name: '',
    username: '',
    password: '',
  });
  const [location, setLocation] = useState(null);
  const [loadingLoc, setLoadingLoc] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleGetLocation = () => {
    setLoadingLoc(true);
    setError('');
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            longitude: position.coords.longitude,
            latitude: position.coords.latitude,
          });
          setLoadingLoc(false);
        },
        (err) => {
          console.error(err);
          setError(t('error_gps_fail'));
          setLoadingLoc(false);
        },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    } else {
      setError(t('error_gps_unsupported'));
      setLoadingLoc(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!location) {
      setError(t('error_gps_req'));
      return;
    }
    if (!form.username.trim() || !form.password) {
      setError(t('signup_credentials_required', { defaultValue: 'Username and password are required.' }));
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // Backend Farmer.geofence is a PolygonField: convert the selected GPS Point into
      // a ~50m x 50m square Polygon with a simple degree approximation.
      const HALF_SIDE_M = 25;
      const latDelta = HALF_SIDE_M / 111320;
      const lngDelta = HALF_SIDE_M / (111320 * Math.cos((location.latitude * Math.PI) / 180));
      const { longitude: lng, latitude: lat } = location;

      const geometry = {
        type: 'Polygon',
        coordinates: [[
          [lng - lngDelta, lat - latDelta],
          [lng + lngDelta, lat - latDelta],
          [lng + lngDelta, lat + latDelta],
          [lng - lngDelta, lat + latDelta],
          [lng - lngDelta, lat - latDelta]
        ]]
      };

      const response = await axios.post(`${API_BASE_URL}/auth/register/`, {
        username: form.username.trim(),
        password: form.password,
        farm_name: form.name.trim(),
        phone_number: form.phone_number.trim(),
        geometry
      });

      localStorage.setItem('access_token', response.data.access);
      localStorage.setItem('refresh_token', response.data.refresh);
      localStorage.setItem('userName', form.username.trim());
      localStorage.setItem('agri_guard_role', 'farmer');
      toast.success(t('login_success'));
      navigate('/');
    } catch (err) {
      console.error(err);
      const detail = err.response?.data?.error || t('error_reg_fail');
      setError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'block w-full ps-11 pe-3 py-3.5 border border-input rounded-xl bg-card text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary transition-colors text-base';
  const labelClass = 'block text-sm font-bold text-foreground mb-2';

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 font-sans relative overflow-hidden">

      {/* Decorative background — theme aware */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-primary/15 blur-3xl"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-accent/15 blur-3xl"></div>
      </div>

      {/* Language Switcher */}
      <div className="absolute top-6 end-6 z-20">
        <LanguageSwitcher />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center items-center gap-3 animate-fade-in">
          <div className="h-12 w-12 bg-gradient-to-tr from-emerald-700 to-emerald-500 rounded-2xl shadow-lg shadow-emerald-500/25 flex items-center justify-center">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight leading-none">AgriGuard</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">{t('app_subtitle')}</p>
          </div>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md animate-slide-up">
        <div className="card-surface py-8 px-5 sm:px-8 shadow-xl">

          <div className="mb-6">
            <h2 className="text-xl font-extrabold text-foreground flex items-center gap-2">
              <Sprout className="h-5 w-5 text-primary" />
              {t('farmer_portal')}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {t('farmer_portal_desc')}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            {/* Step 1: phone — the farmer's primary identity */}
            <div>
              <label htmlFor="phoneNumber" className={labelClass}>
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[11px] font-extrabold me-1.5">1</span>
                {t('phone_label')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 start-0 ps-3.5 flex items-center pointer-events-none">
                  <Phone className="h-5 w-5 text-muted-foreground" />
                </div>
                <input
                  id="phoneNumber"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  placeholder={t('phone_placeholder')}
                  value={form.phone_number}
                  onChange={e => setForm({ ...form, phone_number: e.target.value })}
                  className={inputClass}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{t('phone_hint')}</p>
            </div>

            {/* Step 2: farm name */}
            <div>
              <label htmlFor="farmName" className={labelClass}>
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[11px] font-extrabold me-1.5">2</span>
                {t('farm_name_label')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 start-0 ps-3.5 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
                <input
                  id="farmName"
                  type="text"
                  autoComplete="name"
                  required
                  placeholder={t('farm_name_placeholder')}
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Step 3: GPS — big primary action */}
            <div className="bg-muted/50 p-4 rounded-2xl border border-border">
              <div className={`${labelClass} flex items-center gap-1.5`}>
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[11px] font-extrabold">3</span>
                {t('location_label')}
              </div>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{t('location_hint')}</p>

              {location ? (
                <div className="flex items-center gap-2.5 p-3.5 bg-primary/10 text-primary border border-primary/30 rounded-xl text-sm font-bold">
                  <CheckCircle2 className="h-6 w-6 shrink-0" />
                  <span className="font-mono">{location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleGetLocation}
                  disabled={loadingLoc}
                  className="w-full flex items-center justify-center gap-2 py-4 px-4 border-2 border-dashed border-primary/50 text-primary rounded-xl hover:bg-primary/5 hover:border-primary transition-all text-base font-extrabold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <MapPin className={`h-6 w-6 ${loadingLoc ? 'animate-bounce' : ''}`} />
                  {loadingLoc ? t('acquiring_loc') : t('get_location')}
                </button>
              )}
            </div>

            {/* Step 4: login credentials */}
            <div className="pt-1 border-t border-border/60">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4 mt-4">{t('login_details_section')}</p>

              <div className="space-y-4">
                <div>
                  <label htmlFor="username" className={labelClass}>{t('username_label')}</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 start-0 ps-3.5 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <input
                      id="username"
                      type="text"
                      autoComplete="username"
                      required
                      placeholder={t('username_placeholder')}
                      value={form.username}
                      onChange={e => setForm({ ...form, username: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className={labelClass}>{t('password_label')}</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 start-0 ps-3.5 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <input
                      id="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={6}
                      placeholder="••••••••"
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !location}
              className="w-full flex justify-center items-center gap-2 py-4 px-4 border border-transparent rounded-xl shadow-md text-base font-extrabold text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed group"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {t('registering')}
                </>
              ) : (
                <>
                  <Send className="h-5 w-5 group-hover:translate-x-1 group-hover:-translate-y-1 rtl:group-hover:-translate-x-1 transition-transform" />
                  {t('enable_protection')}
                </>
              )}
            </button>

            <div className="text-center">
              <Link to="/login" className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
                {t('back_to_login', { defaultValue: 'Back to Login' })}
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Register;
