import base64
import io
import json
import unittest
from concurrent.futures import ThreadPoolExecutor
from time import sleep
from unittest.mock import patch

import numpy as np
from PIL import Image
from app import main


class EmbedRequestsTest(unittest.TestCase):
    def test_actual_endpoint_serializes_shared_inference(self):
        shared = {}

        def infer(arr):
            shared['input'] = int(arr[0, 0, 0])
            sleep(.002)
            return np.array([shared['input'], 1], dtype=np.float32), .99, arr

        def request(value):
            image = io.BytesIO()
            Image.new('RGB', (120, 120), (value, 90, 90)).save(image, format='PNG')
            response = main.embed(main.EmbedRequest(photoBase64=base64.b64encode(image.getvalue()).decode()))
            data = json.loads(response.body)
            self.assertTrue(data['ok'])
            # Normalization preserves the ratio and therefore the request identity.
            return round(data['embedding'][0] / data['embedding'][1])

        with patch.object(main, '_embed_mobilefacenet', infer), patch.object(main, 'EMBEDDING_BACKEND', 'mobilefacenet'), patch.object(main, 'ENFORCE_QUALITY', False), patch.object(main, '_liveness', None):
            with ThreadPoolExecutor(max_workers=8) as pool:
                values = list(range(10, 35))
                self.assertEqual(list(pool.map(request, values)), values)

    def test_configured_liveness_failure_is_not_treated_as_absent(self):
        class BrokenModel:
            def get_inputs(self):
                raise RuntimeError('inference unavailable')
        with patch.object(main, '_liveness', BrokenModel()):
            self.assertEqual(main._liveness_score(np.zeros((120, 120, 3), dtype=np.uint8)), 0.0)
        with patch.object(main, '_liveness', None):
            self.assertIsNone(main._liveness_score(np.zeros((120, 120, 3), dtype=np.uint8)))


if __name__ == '__main__':
    unittest.main()
