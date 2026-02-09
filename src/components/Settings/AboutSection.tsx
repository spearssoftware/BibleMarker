/**
 * About Section Component
 *
 * Displays app version, credits, and license information.
 * Checks for new releases (at most once per 24h) when checkForUpdates is enabled.
 * Provides a manual "Check now" button for on-demand update checks.
 */

import { useEffect, useState, useCallback } from 'react';
import { checkForUpdateIfDue, checkForUpdateNow, type UpdateCheckResult } from '@/lib/updateCheck';
import { openUrl } from '@/lib/platform';

interface AboutSectionProps {
  /** When false, no automatic update check is run on mount */
  checkForUpdates?: boolean;
}

export function AboutSection({ checkForUpdates: checkForUpdatesEnabled = true }: AboutSectionProps) {
  const version = __APP_VERSION__;
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null | 'checking'>(
    checkForUpdatesEnabled ? 'checking' : null
  );

  useEffect(() => {
    if (!checkForUpdatesEnabled) {
      queueMicrotask(() => setUpdateResult(null));
      return;
    }
    let cancelled = false;
    queueMicrotask(() => setUpdateResult('checking'));
    checkForUpdateIfDue().then((result) => {
      if (!cancelled) {
        setUpdateResult(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [checkForUpdatesEnabled]);

  const handleCheckNow = useCallback(async () => {
    setUpdateResult('checking');
    const result = await checkForUpdateNow();
    setUpdateResult(result);
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">About</h3>
        <div className="space-y-3 text-sm text-scripture-text">
          <div>
            <div className="font-medium mb-1">BibleMarker</div>
            <div className="text-scripture-muted text-xs">
              Version {version}
              {' · '}
              <a
                href="https://biblemarker.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-scripture-accent hover:underline"
              >
                biblemarker.app
              </a>
            </div>
            <div className="mt-2 flex items-center gap-3">
              {updateResult === 'checking' ? (
                <span className="text-xs text-scripture-muted">Checking for updates…</span>
              ) : updateResult ? (
                <button
                  onClick={() => openUrl(updateResult.url)}
                  className="text-xs text-scripture-accent hover:underline"
                >
                  A new version ({updateResult.version}) is available →
                </button>
              ) : (
                <span className="text-xs text-scripture-muted">You're up to date</span>
              )}
              {updateResult !== 'checking' && (
                <button
                  onClick={handleCheckNow}
                  className="text-xs text-scripture-accent hover:underline"
                >
                  Check now
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-scripture-muted">
            A Precept-style Bible study application with keyword marking, observation lists, and multi-translation support.
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Bible Translations</h3>
        <div className="space-y-3 text-xs text-scripture-muted">
          <div>
            <div className="font-medium text-scripture-text mb-1">getBible API</div>
            <p>Free and open source Bible API (GPL-3.0). Provides access to many translations including KJV, ASV, WEB, and more.</p>
            <p className="mt-1">
              <a 
                href="https://github.com/getbible/v2" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-scripture-accent hover:underline"
              >
                Documentation →
              </a>
            </p>
          </div>

          <div>
            <div className="font-medium text-scripture-text mb-1">Biblia API</div>
            <p>Provided by Faithlife/Logos. Offers NASB, ESV, NIV, NKJV, and other translations. Free tier: 5,000 calls/day.</p>
            <p className="mt-1">
              <a 
                href="https://api.biblia.com/docs/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-scripture-accent hover:underline"
              >
                Documentation →
              </a>
            </p>
          </div>

          <div>
            <div className="font-medium text-scripture-text mb-1">ESV API</div>
            <p>Provided by Crossway. English Standard Version translation. Free for personal use with attribution.</p>
            <p className="mt-1 text-xs">
              Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers.
            </p>
            <p className="mt-1">
              <a 
                href="https://api.esv.org/docs/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-scripture-accent hover:underline"
              >
                Documentation →
              </a>
            </p>
          </div>

          <div>
            <div className="font-medium text-scripture-text mb-1">BibleGateway API</div>
            <p>Provides access to NASB, NIV, ESV, and many other translations. Requires BibleGateway account credentials.</p>
            <p className="mt-1">
              <a 
                href="https://www.biblegateway.com/api/documentation" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-scripture-accent hover:underline"
              >
                Documentation →
              </a>
            </p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">License</h3>
        <p className="text-xs text-scripture-muted">
          This application is provided for personal Bible study use. Bible text is provided by third-party APIs and is subject to their respective terms and copyrights.
        </p>
      </div>
    </div>
  );
}
