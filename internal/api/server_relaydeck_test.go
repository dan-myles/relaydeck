package api

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

var relaydeckAssetPattern = regexp.MustCompile(`/relaydeck/assets/[A-Za-z0-9._-]+\.js`)

func newRelaydeckTestServer(t *testing.T) *Server {
	t.Helper()
	staticDir := t.TempDir()
	t.Setenv("MANAGEMENT_STATIC_PATH", staticDir)
	if err := os.WriteFile(filepath.Join(staticDir, "management.html"), []byte("<html>upstream management panel</html>"), 0o600); err != nil {
		t.Fatalf("failed to write management asset: %v", err)
	}
	return newTestServer(t)
}

func serve(server *Server, method, target string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, nil)
	rr := httptest.NewRecorder()
	server.engine.ServeHTTP(rr, req)
	return rr
}

func TestManagementHTMLServesEmbeddedRelaydeck(t *testing.T) {
	server := newRelaydeckTestServer(t)

	rr := serve(server, http.MethodGet, "/management.html")
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}
	body := rr.Body.String()
	if strings.Contains(body, "upstream management panel") {
		t.Fatalf("/management.html served the downloaded panel instead of Relaydeck")
	}
	if !strings.Contains(body, `<div id="root">`) || !relaydeckAssetPattern.MatchString(body) {
		t.Fatalf("/management.html is not the Relaydeck page: %s", body)
	}
	csp := rr.Header().Get("Content-Security-Policy")
	for _, want := range []string{"connect-src 'self'", "script-src 'self'", "frame-ancestors 'none'"} {
		if !strings.Contains(csp, want) {
			t.Fatalf("Content-Security-Policy %q missing %q", csp, want)
		}
	}
	if got := rr.Header().Get("Referrer-Policy"); got != "no-referrer" {
		t.Fatalf("Referrer-Policy = %q, want no-referrer", got)
	}

	head := serve(server, http.MethodHead, "/management.html")
	if head.Code != http.StatusOK || head.Body.Len() != 0 {
		t.Fatalf("HEAD status = %d body length = %d, want 200 and empty", head.Code, head.Body.Len())
	}
}

func TestAdvancedPanelKeepsDownloadedManagementPanel(t *testing.T) {
	server := newRelaydeckTestServer(t)

	for _, target := range []string{"/management-advanced.html", "/management.html?safe-mode=configure"} {
		rr := serve(server, http.MethodGet, target)
		if rr.Code != http.StatusOK {
			t.Fatalf("%s status = %d, want %d", target, rr.Code, http.StatusOK)
		}
		if !strings.Contains(rr.Body.String(), "upstream management panel") {
			t.Fatalf("%s did not serve the downloaded panel: %s", target, rr.Body.String())
		}
	}
}

func TestRelaydeckAssetsAreServedImmutable(t *testing.T) {
	server := newRelaydeckTestServer(t)
	page := serve(server, http.MethodGet, "/management.html").Body.String()
	asset := relaydeckAssetPattern.FindString(page)
	if asset == "" {
		t.Fatalf("no script asset referenced by the Relaydeck page")
	}

	rr := serve(server, http.MethodGet, asset)
	if rr.Code != http.StatusOK {
		t.Fatalf("%s status = %d, want %d", asset, rr.Code, http.StatusOK)
	}
	if got := rr.Header().Get("Cache-Control"); !strings.Contains(got, "immutable") {
		t.Fatalf("Cache-Control = %q, want immutable", got)
	}
	if got := rr.Header().Get("Content-Type"); !strings.Contains(got, "javascript") {
		t.Fatalf("Content-Type = %q, want javascript", got)
	}

	for _, target := range []string{
		"/relaydeck/index.html",
		"/relaydeck/assets/missing.js",
		"/relaydeck/assets/../index.html",
		"/relaydeck/assets",
	} {
		if code := serve(server, http.MethodGet, target).Code; code != http.StatusNotFound {
			t.Fatalf("%s status = %d, want %d", target, code, http.StatusNotFound)
		}
	}
}

func TestRelaydeckRoutesFollowControlPanelSwitches(t *testing.T) {
	server := newRelaydeckTestServer(t)
	asset := relaydeckAssetPattern.FindString(serve(server, http.MethodGet, "/management.html").Body.String())
	targets := []string{"/management.html", "/management-advanced.html", asset}

	server.cfg.RemoteManagement.DisableControlPanel = true
	for _, target := range targets {
		if code := serve(server, http.MethodGet, target).Code; code != http.StatusNotFound {
			t.Fatalf("disable-control-panel: %s status = %d, want %d", target, code, http.StatusNotFound)
		}
	}

	server.cfg.RemoteManagement.DisableControlPanel = false
	server.cfg.Home.Enabled = true
	for _, target := range targets {
		if code := serve(server, http.MethodGet, target).Code; code != http.StatusNotFound {
			t.Fatalf("home mode: %s status = %d, want %d", target, code, http.StatusNotFound)
		}
	}
}
