/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    // Basic session initialization logic will be handled by Auth/Dashboard internally,
    // but we can ensure the top-level router switches views correctly.
  }, []);

  return (
    <>
      {!session ? (
        <Auth onAuthSuccess={(s) => setSession(s)} />
      ) : (
        <Dashboard />
      )}
    </>
  );
}

