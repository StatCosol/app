import math
import unittest
from concurrent.futures import ThreadPoolExecutor
from time import sleep

from app.inference_safety import INFERENCE_LOCK, real_probability


class InferenceSafetyTests(unittest.TestCase):
    def test_confident_spoof_is_not_real(self):
        self.assertAlmostEqual(real_probability([math.log(.99), math.log(.01)], 1), .01)

    def test_real_and_three_class_compatibility(self):
        self.assertAlmostEqual(real_probability([math.log(.01), math.log(.99)], 1), .99)
        self.assertAlmostEqual(real_probability([math.log(.1), math.log(.8), math.log(.1)], 1), .8)
        self.assertAlmostEqual(real_probability([math.log(.9), math.log(.1)], 0), .9)

    def test_invalid_outputs_fail_closed(self):
        for values, index in [([1], 0), ([1, 2], 2), ([1, 2], -1), ([float('nan'), 1], 1)]:
            with self.assertRaises(ValueError):
                real_probability(values, index)

    def test_interleaved_requests_keep_their_own_input(self):
        interpreter = {}
        def infer(value):
            with INFERENCE_LOCK:
                interpreter['input'] = value
                sleep(.001)
                interpreter['output'] = interpreter['input']
                sleep(.001)
                return interpreter['output']
        with ThreadPoolExecutor(max_workers=8) as pool:
            self.assertEqual(list(pool.map(infer, range(30))), list(range(30)))


if __name__ == '__main__':
    unittest.main()
