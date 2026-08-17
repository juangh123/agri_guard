import React, { useState } from 'react';
import axios from 'axios';
import { ShieldAlert, MapPin, Send, CheckCircle2, User, Phone, ArrowLeft, Droplets, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

const Register = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: '',
    password: '',
    name: '',
    phone_number: '',
  });
  const [location, setLocation] = useState(null);
  const [loadingLoc, setLoadingLoc] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

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
        }
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

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-green-100 via-gray-50 to-white flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans relative overflow-hidden">
      
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-green-200/40 blur-3xl"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-yellow-200/40 blur-3xl"></div>
      </div>

      {/* Language Switcher */}
      <div className="absolute top-6 right-6 z-20">
        <select 
          onChange={(e) => changeLanguage(e.target.value)} 
          value={i18n.language}
          className="bg-white/60 border border-white/60 text-gray-700 text-sm rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 backdrop-blur-sm transition-all shadow-sm"
        >
          <option value="en" className="bg-white">English</option>
          <option value="fr" className="bg-white">Français</option>
          <option value="sw" className="bg-white">Kiswahili</option>
        </select>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center items-center gap-3 animate-fade-in">
          <div className="h-12 w-12 p-2.5 bg-gradient-to-br from-green-400 to-green-600 rounded-xl shadow-lg shadow-green-500/30 flex items-center justify-center">
            <Droplets className="h-full w-full text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">AgriGuard</h1>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md animate-slide-up">
        <div className="glass-panel py-8 px-4 shadow-2xl shadow-green-900/5 sm:rounded-3xl sm:px-10 border border-white/60 relative">
          <div className="absolute inset-0 bg-white/40 rounded-3xl -z-10 backdrop-blur-xl"></div>
          
          <div className="mb-6 relative z-10">
            <h2 className="text-xl font-bold text-gray-900">{t('farmer_portal')}</h2>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">
              {t('farmer_portal_desc')}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600 flex items-start gap-3 relative z-10">
              <ShieldAlert className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-5 relative z-10" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="username" className="block text-sm font-semibold text-gray-700">
                {t('username_label')}
              </label>
              <div className="mt-2 relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="username"
                  type="text"
                  required
                  placeholder={t('username_placeholder')}
                  value={form.username}
                  onChange={e => setForm({...form, username: e.target.value})}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl bg-white/50 focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors text-gray-900 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700">
                {t('password_label')}
              </label>
              <div className="mt-2 relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm({...form, password: e.target.value})}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl bg-white/50 focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors text-gray-900 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="farmName" className="block text-sm font-semibold text-gray-700">
                {t('farm_name_label')}
              </label>
              <div className="mt-2 relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="farmName"
                  type="text"
                  required
                  placeholder={t('farm_name_placeholder')}
                  value={form.name}
                  onChange={e => setForm({...form, name: e.target.value})}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl bg-white/50 focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors text-gray-900 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="phoneNumber" className="block text-sm font-semibold text-gray-700">
                {t('phone_label')}
              </label>
              <div className="mt-2 relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Phone className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="phoneNumber"
                  type="tel"
                  required
                  placeholder={t('phone_placeholder')}
                  value={form.phone_number}
                  onChange={e => setForm({...form, phone_number: e.target.value})}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl bg-white/50 focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors text-gray-900 sm:text-sm"
                />
              </div>
            </div>

            <div className="bg-white/40 p-5 rounded-xl border border-white/60">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                {t('location_label')}
              </label>
              
              {location ? (
                <div className="flex items-center gap-2 p-3 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm font-medium">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span>{t('loc_acquired')} {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</span>
                </div>
              ) : (
                <button 
                  type="button"
                  onClick={handleGetLocation}
                  disabled={loadingLoc}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 border-2 border-dashed border-green-400 text-green-600 rounded-xl hover:bg-green-50 hover:border-green-500 transition-all text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <MapPin className="h-5 w-5" />
                  {loadingLoc ? t('acquiring_loc') : t('get_location')}
                </button>
              )}
            </div>

            <div>
              <button
                type="submit"
                disabled={submitting || !location}
                className="w-full flex justify-center items-center gap-2 py-3.5 px-4 border border-transparent rounded-xl shadow-md text-sm font-bold text-white bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed group"
              >
                {submitting ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {t('registering')}
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" /> 
                    {t('enable_protection')}
                  </>
                )}
              </button>
            </div>
            
            <div className="mt-4 text-center">
              <Link to="/login" className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-green-600 transition-colors">
                <ArrowLeft className="h-4 w-4" />
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
