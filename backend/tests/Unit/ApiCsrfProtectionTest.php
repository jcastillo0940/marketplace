<?php

namespace Tests\Unit;

use Illuminate\Cookie\CookieValuePrefix;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Http\Request;
use Illuminate\Session\ArraySessionHandler;
use Illuminate\Session\Store;
use Illuminate\Session\TokenMismatchException;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

class ApiCsrfProtectionTest extends TestCase
{
    public function test_stateful_api_mutation_without_csrf_token_is_rejected(): void
    {
        $middleware = new class(app(), app('encrypter')) extends ValidateCsrfToken
        {
            protected function runningUnitTests(): bool
            {
                return false;
            }
        };

        $request = Request::create('/api/me/profile', 'PUT');
        $session = new Store('test-session', new ArraySessionHandler(120));
        $session->start();
        $request->setLaravelSession($session);

        $this->expectException(TokenMismatchException::class);

        $middleware->handle($request, fn () => new Response('updated'));
    }

    public function test_stateful_api_mutation_with_valid_csrf_token_is_allowed(): void
    {
        $middleware = new class(app(), app('encrypter')) extends ValidateCsrfToken
        {
            protected function runningUnitTests(): bool
            {
                return false;
            }
        };

        $session = new Store('test-session', new ArraySessionHandler(120));
        $session->start();
        $token = $session->token();
        $xsrfCookieValue = CookieValuePrefix::create('XSRF-TOKEN', $token).$token;
        $encryptedXsrfCookie = app('encrypter')->encrypt($xsrfCookieValue, ValidateCsrfToken::serialized());
        $request = Request::create('/api/me/profile', 'PUT', [], [], [], ['HTTP_X_XSRF_TOKEN' => $encryptedXsrfCookie]);
        $request->setLaravelSession($session);

        $response = $middleware->handle($request, fn () => new Response('updated'));

        $this->assertSame('updated', $response->getContent());
    }

    public function test_public_intake_endpoints_remain_accessible_without_a_csrf_token(): void
    {
        $middleware = new class(app(), app('encrypter')) extends ValidateCsrfToken
        {
            protected function runningUnitTests(): bool
            {
                return false;
            }
        };

        foreach (['/api/search-events', '/api/contact-events', '/api/reports'] as $path) {
            $request = Request::create($path, 'POST');
            $session = new Store('test-session', new ArraySessionHandler(120));
            $session->start();
            $request->setLaravelSession($session);

            $response = $middleware->handle($request, fn () => new Response('accepted'));

            $this->assertSame('accepted', $response->getContent(), $path);
        }
    }
}
