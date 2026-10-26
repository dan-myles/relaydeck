// Package relaydeck embeds the Relaydeck management UI.
//
// The UI source lives in web/relaydeck; `npm run build` there writes the
// production bundle into dist/, which is committed so a plain `go build`
// produces a binary that serves it without Node or network access.
package relaydeck

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

//go:embed all:dist
var distFS embed.FS

// AssetPrefix is the URL path under which the bundle's assets are served.
const AssetPrefix = "/relaydeck/"

// ContentSecurityPolicy keeps the page and everything it loads or calls on
// the relay's own origin, so the management key cannot leave it.
const ContentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; " +
	"connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'"

// IndexHTML returns the built entry page.
func IndexHTML() ([]byte, error) {
	return distFS.ReadFile("dist/index.html")
}

// OpenAsset opens a bundle file by its path below AssetPrefix. Only files in
// assets/ are exposed; the entry page is served separately.
func OpenAsset(name string) (fs.File, fs.FileInfo, error) {
	cleaned := path.Clean("/" + name)
	if !strings.HasPrefix(cleaned, "/assets/") {
		return nil, nil, fs.ErrNotExist
	}
	file, err := distFS.Open("dist" + cleaned)
	if err != nil {
		return nil, nil, err
	}
	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, nil, err
	}
	if info.IsDir() {
		_ = file.Close()
		return nil, nil, fs.ErrNotExist
	}
	return file, info, nil
}

// SetPageHeaders applies the headers every Relaydeck page response carries.
func SetPageHeaders(header http.Header) {
	header.Set("Content-Type", "text/html; charset=utf-8")
	header.Set("Cache-Control", "no-cache")
	header.Set("Content-Security-Policy", ContentSecurityPolicy)
	header.Set("Referrer-Policy", "no-referrer")
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("X-Frame-Options", "DENY")
}
