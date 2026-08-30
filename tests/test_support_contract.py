"""Support-message input contracts shared by the user and admin UIs."""

import pytest
from pydantic import ValidationError

from app.routers.admin_support import AdminReplyRequest
from app.routers.support import SupportMessageRequest


@pytest.mark.parametrize("model", [SupportMessageRequest, AdminReplyRequest])
def test_support_message_requires_text_or_an_image(model) -> None:
    with pytest.raises(ValidationError, match="contain"):
        model(content="   ", attachment_data=None)


@pytest.mark.parametrize("model", [SupportMessageRequest, AdminReplyRequest])
def test_support_message_rejects_non_image_data_uri(model) -> None:
    with pytest.raises(ValidationError, match="JPEG, PNG, WebP, or GIF"):
        model(content="", attachment_data="data:text/html;base64,PGgxPmJhZDwvaDE+")


@pytest.mark.parametrize("model", [SupportMessageRequest, AdminReplyRequest])
def test_support_message_accepts_compressed_jpeg(model) -> None:
    request = model(content="Screenshot attached", attachment_data="data:image/jpeg;base64,YWJj")

    assert request.content == "Screenshot attached"
