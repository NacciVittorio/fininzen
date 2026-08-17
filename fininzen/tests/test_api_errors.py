from fininzen.api_errors import (
    archived_asset_response,
    invalid_request_response,
    transaction_validation_response,
)


def test_invalid_request_response_is_stable():
    response = invalid_request_response()

    assert response.status_code == 400
    assert response.data == {"error": "invalid_request"}


def test_archived_asset_response_is_stable():
    response = archived_asset_response()

    assert response.status_code == 409
    assert response.data == {
        "error": "asset_archived",
        "detail": "Archived asset transactions are read-only",
    }


def test_transaction_validation_response_allows_known_message():
    response = transaction_validation_response(
        ValueError("This asset does not support contribution sources")
    )

    assert response.status_code == 400
    assert response.data == {
        "error": "This asset does not support contribution sources"
    }


def test_transaction_validation_response_rejects_unknown_exception_text():
    sensitive_detail = "SELECT password FROM auth_user at /srv/app/secrets.py"
    response = transaction_validation_response(RuntimeError(sensitive_detail))

    assert response.status_code == 400
    assert response.data == {"error": "invalid_request"}
    assert sensitive_detail not in str(response.data)
