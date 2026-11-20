package com.shekeeps.auth.controller;

import com.shekeeps.auth.service.AuthService;
import com.shekeeps.auth.dto.ApiModels.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.*;
import org.springframework.web.client.RestClient;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/api")
public class AuthController {
    private final AuthService auth;
    @Value("${app.cookie-secure:false}") private boolean secureCookies;
    @Value("${app.google.client-id:}") private String googleClientId;
    @Value("${app.google.client-secret:}") private String googleClientSecret;
    @Value("${app.google.redirect-uri:http://localhost:5000/api/auth/google/callback}") private String googleRedirectUri;
    @Value("${app.frontend-url:http://localhost:3000}") private String frontendUrl;
    public AuthController(AuthService auth) { this.auth=auth; }

    @GetMapping("/health") public ResponseEntity<?> health() {
        boolean healthy=auth.databaseHealthy();
        return ResponseEntity.status(healthy?200:503).body(Map.of("status",healthy?"healthy":"degraded","timestamp",Instant.now().toString(),"database",healthy?"connected":"disconnected"));
    }

    @PostMapping("/auth/register") public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest body,HttpServletResponse response) {
        var result=auth.register(body); setCookies(response,result); return ResponseEntity.status(201).body(result);
    }
    @PostMapping("/auth/login") public ResponseEntity<?> login(@Valid @RequestBody LoginRequest body,HttpServletResponse response) {
        var result=auth.login(body); setCookies(response,result); return ResponseEntity.ok(result);
    }
    @GetMapping("/auth/google") public void google(HttpServletResponse response) throws java.io.IOException {
        if (googleClientId.isBlank()) { response.sendError(503, "Google OAuth is not configured"); return; }
        String state = UUID.randomUUID().toString();
        ResponseCookie stateCookie = ResponseCookie.from("oauthState", state).httpOnly(true).secure(secureCookies).sameSite("Lax").path("/api/auth/google").maxAge(300).build();
        response.addHeader(HttpHeaders.SET_COOKIE, stateCookie.toString());
        String url = "https://accounts.google.com/o/oauth2/v2/auth?client_id=" + enc(googleClientId) + "&redirect_uri=" + enc(googleRedirectUri) + "&response_type=code&scope=" + enc("openid email profile") + "&state=" + enc(state) + "&prompt=select_account";
        response.sendRedirect(url);
    }
    @GetMapping("/auth/google/callback") public void googleCallback(@RequestParam(required=false) String code, @RequestParam(required=false) String state,
            @RequestParam(required=false) String error, HttpServletRequest request, HttpServletResponse response) throws java.io.IOException {
        String expected = request.getCookies() == null ? null : Arrays.stream(request.getCookies()).filter(c -> c.getName().equals("oauthState")).map(jakarta.servlet.http.Cookie::getValue).findFirst().orElse(null);
        response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from("oauthState", "").httpOnly(true).secure(secureCookies).sameSite("Lax").path("/api/auth/google").maxAge(0).build().toString());
        try {
            if (error != null || code == null || state == null || !state.equals(expected) || googleClientId.isBlank() || googleClientSecret.isBlank()) throw new IllegalArgumentException("Google sign-in could not be completed");
            MultiValueMap<String,String> form = new LinkedMultiValueMap<>(); form.add("code", code); form.add("client_id", googleClientId); form.add("client_secret", googleClientSecret); form.add("redirect_uri", googleRedirectUri); form.add("grant_type", "authorization_code");
            Map<?,?> token = RestClient.create().post().uri("https://oauth2.googleapis.com/token").contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().body(Map.class);
            String accessToken = String.valueOf(token.get("access_token"));
            Map<?,?> profile = RestClient.create().get().uri("https://www.googleapis.com/oauth2/v2/userinfo").headers(h -> h.setBearerAuth(accessToken)).retrieve().body(Map.class);
            if (!Boolean.TRUE.equals(profile.get("verified_email")) || profile.get("email") == null) throw new IllegalArgumentException("Google did not verify this email address");
            Object profileName = profile.get("name");
            setCookies(response, auth.loginWithGoogle(String.valueOf(profile.get("email")), profileName == null ? "" : String.valueOf(profileName)));
            response.sendRedirect(frontendUrl);
        } catch (Exception ex) { response.sendRedirect(frontendUrl + (frontendUrl.contains("?") ? "&" : "?") + "oauthError=" + enc("Google sign-in failed. Please try again.")); }
    }
    private String enc(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
    @PostMapping("/auth/refresh") public ResponseEntity<?> refresh(@RequestBody(required=false) TokenRequest body,HttpServletRequest request,HttpServletResponse response) {
        String token=token(body,request); var result=auth.refresh(token); setCookies(response,result); return ResponseEntity.ok(result);
    }
    @PostMapping("/auth/logout") public ResponseEntity<?> logout(@RequestBody(required=false) TokenRequest body,HttpServletRequest request,HttpServletResponse response) {
        auth.logout(token(body,request)); clearCookies(response); return ResponseEntity.ok(Map.of("status","success","message","Logged out successfully"));
    }
    @GetMapping("/auth/me") public ResponseEntity<?> me(HttpServletRequest request) {
        String token=null; String authorization=request.getHeader(HttpHeaders.AUTHORIZATION);
        if(authorization!=null && authorization.startsWith("Bearer ")) token=authorization.substring(7);
        else if(request.getCookies()!=null) for(var cookie:request.getCookies()) if(cookie.getName().equals("accessToken")){token=cookie.getValue();break;}
        return ResponseEntity.ok(Map.of("status","success","data",Map.of("user",auth.authenticate(token),"authBypass",auth.authBypassEnabled())));
    }
    private String token(TokenRequest body,HttpServletRequest request) {
        if(request.getCookies()!=null) for(var cookie:request.getCookies()) if(cookie.getName().equals("refreshToken")) return cookie.getValue();
        if(body!=null && body.refreshToken()!=null) return body.refreshToken();
        return request.getHeader("X-Refresh-Token");
    }
    @SuppressWarnings("unchecked") private void setCookies(HttpServletResponse response,Map<String,Object> payload) {
        Map<String,Object> data=(Map<String,Object>)payload.get("data"); if(data==null)return;
        cookie(response,"accessToken",(String)data.get("accessToken"),900,"/");
        cookie(response,"refreshToken",(String)data.get("refreshToken"),604800,"/api/auth");
    }
    private void clearCookies(HttpServletResponse response) { cookie(response,"accessToken","",0,"/");cookie(response,"refreshToken","",0,"/api/auth"); }
    private void cookie(HttpServletResponse response,String name,String value,int age,String path) {
        ResponseCookie c=ResponseCookie.from(name,value).httpOnly(true).secure(secureCookies).sameSite(secureCookies?"None":"Lax").path(path).maxAge(age).build();
        response.addHeader(HttpHeaders.SET_COOKIE,c.toString());
    }
}
