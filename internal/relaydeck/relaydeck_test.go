package relaydeck

import (
	"io/fs"
	"regexp"
	"strings"
	"testing"
)

var referencePattern = regexp.MustCompile(`(?:src|href)="([^"]+)"`)

func TestIndexReferencesOnlyEmbeddedAssets(t *testing.T) {
	page, err := IndexHTML()
	if err != nil {
		t.Fatalf("IndexHTML() error = %v", err)
	}
	matches := referencePattern.FindAllStringSubmatch(string(page), -1)
	if len(matches) == 0 {
		t.Fatalf("index.html references no assets; was the bundle built?")
	}
	for _, match := range matches {
		ref := match[1]
		if !strings.HasPrefix(ref, AssetPrefix+"assets/") {
			t.Fatalf("index.html references %q outside %sassets/", ref, AssetPrefix)
		}
		file, _, errOpen := OpenAsset(strings.TrimPrefix(ref, AssetPrefix))
		if errOpen != nil {
			t.Fatalf("referenced asset %q is not embedded: %v", ref, errOpen)
		}
		_ = file.Close()
	}
}

func TestBundleLoadsNothingFromOtherOrigins(t *testing.T) {
	external := regexp.MustCompile(`(?:url\(|from\s*|import\s*\(|src=|href=)\s*["']?(?:https?:)?//`)
	err := fs.WalkDir(distFS, "dist", func(path string, entry fs.DirEntry, errWalk error) error {
		if errWalk != nil || entry.IsDir() {
			return errWalk
		}
		if !strings.HasSuffix(path, ".js") && !strings.HasSuffix(path, ".css") && !strings.HasSuffix(path, ".html") {
			return nil
		}
		data, errRead := distFS.ReadFile(path)
		if errRead != nil {
			return errRead
		}
		if loc := external.FindIndex(data); loc != nil {
			t.Errorf("%s loads from another origin near %q", path, string(data[loc[0]:min(loc[1]+40, len(data))]))
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walk dist: %v", err)
	}
}

func TestOpenAssetRejectsPathsOutsideAssets(t *testing.T) {
	for _, name := range []string{"index.html", "/index.html", "assets/../index.html", "../relaydeck.go", "assets", "assets/"} {
		if file, _, err := OpenAsset(name); err == nil {
			_ = file.Close()
			t.Fatalf("OpenAsset(%q) succeeded, want error", name)
		}
	}
}
