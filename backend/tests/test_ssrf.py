import pytest

from app.services.ai_service import _validate_url_target


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1",
        "http://localhost",
        "http://169.254.169.254/latest/meta-data",
        "http://10.0.0.5",
        "http://192.168.1.1",
        "http://[::1]",
        "file:///etc/passwd",
        "ftp://example.com",
    ],
)
def test_ssrf_blocks_unsafe_urls(url):
    with pytest.raises(ValueError):
        _validate_url_target(url)


def test_ssrf_allows_public_url(monkeypatch):
    def fake_getaddrinfo(host, port):
        return [(2, 1, 6, "", ("93.184.216.34", port))]

    monkeypatch.setattr("app.services.ai_service.socket.getaddrinfo", fake_getaddrinfo)
    _validate_url_target("https://example.com")
